// =============================================================================
// @neo/server — Domain tools: CRUD for MasterDomain and Domain nodes
// =============================================================================
// Registers five MCP tools for managing the MasterDomain and Domain tiers
// of the knowledge graph. All reads use session.executeRead() and all writes
// use session.executeWrite() for automatic retry on transient failures.
// =============================================================================

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import neo4j from "neo4j-driver";
import {
  ListInput,
  ListDomainsInput,
  CreateMasterDomainInput,
  CreateDomainInput,
  DeleteInput,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerDomainTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, logger } = deps;

  // -------------------------------------------------------------------------
  // list_master_domains — paginated listing of all MasterDomain nodes
  // -------------------------------------------------------------------------
  server.tool("list_master_domains", ListInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();
    try {
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;

      const result = await session.executeRead(async (tx) => {
        return tx.run(
          "MATCH (m:MasterDomain) RETURN m ORDER BY m.title SKIP $offset LIMIT $limit",
          { offset: neo4j.int(offset), limit: neo4j.int(limit) },
        );
      });

      const masterDomains = result.records.map((record) => {
        const node = record.get("m");
        return {
          id: node.elementId,
          ...node.properties,
        };
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "list_master_domains", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(masterDomains, null, 2),
          },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "list_master_domains", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to list master domains: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // create_master_domain — create a new MasterDomain node
  // -------------------------------------------------------------------------
  server.tool(
    "create_master_domain",
    CreateMasterDomainInput.shape,
    async (input) => {
      const start = performance.now();
      const session = driver.session();
      try {
        // Check for duplicate slug
        const existing = await session.executeRead(async (tx) => {
          return tx.run(
            "MATCH (m:MasterDomain {slug: $slug}) RETURN m LIMIT 1",
            { slug: input.slug },
          );
        });

        if (existing.records.length > 0) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "create_master_domain",
            input,
            durationMs,
            "Duplicate slug",
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `Error: A master domain with slug "${input.slug}" already exists`,
              },
            ],
            isError: true,
          };
        }

        // Create the node
        const result = await session.executeWrite(async (tx) => {
          return tx.run(
            `CREATE (m:MasterDomain {
              title: $title,
              slug: $slug,
              description: $description,
              color: $color,
              status: "active"
            }) RETURN m`,
            {
              title: input.title,
              slug: input.slug,
              description: input.description,
              color: input.color ?? null,
            },
          );
        });

        const node = result.records[0].get("m");
        const created = {
          id: node.elementId,
          ...node.properties,
        };

        const durationMs = performance.now() - start;
        logToolCall(logger, "create_master_domain", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(created, null, 2) },
          ],
        };
      } catch (err) {
        const durationMs = performance.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logToolCall(
          logger,
          "create_master_domain",
          input,
          durationMs,
          errorMsg,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to create master domain: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      } finally {
        await session.close();
      }
    },
  );

  // -------------------------------------------------------------------------
  // list_domains — paginated listing of Domain nodes, optional filter by
  //                master_domain_slug
  // -------------------------------------------------------------------------
  server.tool("list_domains", ListDomainsInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();
    try {
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;

      const result = await session.executeRead(async (tx) => {
        if (input.master_domain_slug) {
          return tx.run(
            `MATCH (m:MasterDomain {slug: $masterSlug})-[:HAS_DOMAIN]->(d:Domain)
             RETURN d ORDER BY d.title SKIP $offset LIMIT $limit`,
            {
              masterSlug: input.master_domain_slug,
              offset: neo4j.int(offset),
              limit: neo4j.int(limit),
            },
          );
        }

        return tx.run(
          "MATCH (d:Domain) RETURN d ORDER BY d.title SKIP $offset LIMIT $limit",
          { offset: neo4j.int(offset), limit: neo4j.int(limit) },
        );
      });

      const domains = result.records.map((record) => {
        const node = record.get("d");
        return {
          id: node.elementId,
          ...node.properties,
        };
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "list_domains", input, durationMs);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(domains, null, 2) },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "list_domains", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to list domains: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // create_domain — create a Domain node linked to a MasterDomain
  // -------------------------------------------------------------------------
  server.tool("create_domain", CreateDomainInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();
    try {
      // Verify the master domain exists
      const masterCheck = await session.executeRead(async (tx) => {
        return tx.run(
          "MATCH (m:MasterDomain {slug: $masterSlug}) RETURN m LIMIT 1",
          { masterSlug: input.master_domain_slug },
        );
      });

      if (masterCheck.records.length === 0) {
        const durationMs = performance.now() - start;
        logToolCall(
          logger,
          "create_domain",
          input,
          durationMs,
          "Master domain not found",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Master domain with slug "${input.master_domain_slug}" not found`,
            },
          ],
          isError: true,
        };
      }

      // Check for duplicate domain slug
      const existing = await session.executeRead(async (tx) => {
        return tx.run("MATCH (d:Domain {slug: $slug}) RETURN d LIMIT 1", {
          slug: input.slug,
        });
      });

      if (existing.records.length > 0) {
        const durationMs = performance.now() - start;
        logToolCall(
          logger,
          "create_domain",
          input,
          durationMs,
          "Duplicate slug",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: A domain with slug "${input.slug}" already exists`,
            },
          ],
          isError: true,
        };
      }

      // Create the domain and link to master domain
      const result = await session.executeWrite(async (tx) => {
        return tx.run(
          `MATCH (m:MasterDomain {slug: $masterSlug})
           CREATE (d:Domain {
             title: $title,
             slug: $slug,
             description: $description
           })
           CREATE (m)-[:HAS_DOMAIN]->(d)
           RETURN d`,
          {
            masterSlug: input.master_domain_slug,
            title: input.title,
            slug: input.slug,
            description: input.description,
          },
        );
      });

      const node = result.records[0].get("d");
      const created = {
        id: node.elementId,
        ...node.properties,
      };

      const durationMs = performance.now() - start;
      logToolCall(logger, "create_domain", input, durationMs);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(created, null, 2) },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "create_domain", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to create domain: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // delete_domain — delete a Domain node and all its relationships
  // -------------------------------------------------------------------------
  server.tool("delete_domain", DeleteInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();
    try {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(
          "MATCH (d:Domain) WHERE elementId(d) = $id DETACH DELETE d RETURN count(d) AS deleted",
          { id: input.id },
        );
      });

      const deletedCount = result.records[0].get("deleted");
      const count =
        typeof deletedCount === "object" &&
        deletedCount !== null &&
        "toNumber" in deletedCount
          ? (deletedCount as { toNumber: () => number }).toNumber()
          : Number(deletedCount ?? 0);

      if (count === 0) {
        const durationMs = performance.now() - start;
        logToolCall(
          logger,
          "delete_domain",
          input,
          durationMs,
          "Domain not found",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Domain with id "${input.id}" not found`,
            },
          ],
          isError: true,
        };
      }

      const durationMs = performance.now() - start;
      logToolCall(logger, "delete_domain", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { message: "Domain deleted successfully", id: input.id },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "delete_domain", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to delete domain: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
