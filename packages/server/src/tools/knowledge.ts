// =============================================================================
// @neo/server — Knowledge node tools: list, create, update, delete
// =============================================================================
// Registers four MCP tools for CRUD operations on KnowledgeNode nodes in the
// Neo4j knowledge graph. create and update generate Gemini embeddings via
// embedForStorage. update re-embeds only when definition or summary changes.
// =============================================================================

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import neo4j from "neo4j-driver";
import {
  ListKnowledgeNodesInput,
  CreateKnowledgeNodeInput,
  UpdateKnowledgeNodeInput,
  DeleteInput,
  embedForStorage,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips the `embedding` property from a Neo4j node properties object.
 * The embedding is a 768-element float array, too large for listing responses.
 */
function excludeEmbedding(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { embedding: _embedding, ...rest } = props;
  return rest;
}

/**
 * Converts Neo4j Integer objects to JS numbers in node properties.
 * Also parses any JSON-stringified `evidence` field back into an array.
 */
function normalizeProperties(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "toNumber" in value &&
      typeof (value as { toNumber: unknown }).toNumber === "function"
    ) {
      result[key] = (value as { toNumber: () => number }).toNumber();
    } else {
      result[key] = value;
    }
  }

  // Parse evidence JSON string back into array
  if (typeof result.evidence === "string") {
    try {
      result.evidence = JSON.parse(result.evidence);
    } catch {
      // If parsing fails, leave as string
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerKnowledgeTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, embeddingClient, logger } = deps;

  // -------------------------------------------------------------------------
  // list_knowledge_nodes — paginated listing with optional domain filter
  // -------------------------------------------------------------------------
  server.tool(
    "list_knowledge_nodes",
    ListKnowledgeNodesInput.shape,
    async (input) => {
      const start = performance.now();
      const { limit = 20, offset = 0, domain_slug } = input;
      const session = driver.session();

      try {
        const result = await session.executeRead(async (tx) => {
          if (domain_slug) {
            return tx.run(
              `MATCH (k:KnowledgeNode)-[:BELONGS_TO]->(d:Domain {slug: $domainSlug})
               RETURN k, elementId(k) AS id
               ORDER BY k.title
               SKIP $offset LIMIT $limit`,
              {
                domainSlug: domain_slug,
                offset: neo4j.int(offset),
                limit: neo4j.int(limit),
              },
            );
          }

          return tx.run(
            `MATCH (k:KnowledgeNode)
             RETURN k, elementId(k) AS id
             ORDER BY k.title
             SKIP $offset LIMIT $limit`,
            {
              offset: neo4j.int(offset),
              limit: neo4j.int(limit),
            },
          );
        });

        const nodes = result.records.map((record) => {
          const props = normalizeProperties(record.get("k").properties);
          return {
            id: record.get("id"),
            ...excludeEmbedding(props),
          };
        });

        const durationMs = performance.now() - start;
        logToolCall(logger, "list_knowledge_nodes", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(nodes, null, 2) },
          ],
        };
      } catch (err) {
        const durationMs = performance.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logToolCall(
          logger,
          "list_knowledge_nodes",
          input,
          durationMs,
          errorMsg,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to list knowledge nodes: ${errorMsg}`,
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
  // create_knowledge_node — create node with Gemini embedding
  // -------------------------------------------------------------------------
  server.tool(
    "create_knowledge_node",
    CreateKnowledgeNodeInput.shape,
    async (input) => {
      const start = performance.now();
      const {
        title,
        summary,
        definition,
        domain_slug,
        claim_type,
        confidence,
        deep_content,
        evidence,
        conditions,
        temporal_range,
        geographic_scope,
      } = input;
      const session = driver.session();

      try {
        // Verify domain exists
        const domainCheck = await session.executeRead(async (tx) => {
          return tx.run(`MATCH (d:Domain {slug: $domainSlug}) RETURN d`, {
            domainSlug: domain_slug,
          });
        });

        if (domainCheck.records.length === 0) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "create_knowledge_node",
            input,
            durationMs,
            `Domain not found: ${domain_slug}`,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Domain with slug "${domain_slug}" not found`,
              },
            ],
            isError: true,
          };
        }

        // Generate embedding
        const embedding = await embedForStorage(
          embeddingClient,
          definition,
          summary,
        );

        const freshnessDate = new Date().toISOString();

        // Build params
        const params: Record<string, unknown> = {
          title,
          summary,
          definition,
          embedding,
          domainSlug: domain_slug,
          claimType: claim_type,
          status: "active",
          freshnessDate,
        };

        // Optional fields
        if (confidence !== undefined) params.confidence = confidence;
        if (deep_content !== undefined) params.deepContent = deep_content;
        if (evidence !== undefined) params.evidence = JSON.stringify(evidence);
        if (conditions !== undefined) params.conditions = conditions;
        if (temporal_range !== undefined) params.temporalRange = temporal_range;
        if (geographic_scope !== undefined)
          params.geographicScope = geographic_scope;

        const result = await session.executeWrite(async (tx) => {
          return tx.run(
            `MATCH (d:Domain {slug: $domainSlug})
             CREATE (k:KnowledgeNode {
               title: $title,
               summary: $summary,
               definition: $definition,
               embedding: $embedding,
               status: $status,
               freshness_date: $freshnessDate,
               claim_type: $claimType
               ${confidence !== undefined ? ", confidence: $confidence" : ""}
               ${deep_content !== undefined ? ", deep_content: $deepContent" : ""}
               ${evidence !== undefined ? ", evidence: $evidence" : ""}
               ${conditions !== undefined ? ", conditions: $conditions" : ""}
               ${temporal_range !== undefined ? ", temporal_range: $temporalRange" : ""}
               ${geographic_scope !== undefined ? ", geographic_scope: $geographicScope" : ""}
             })
             CREATE (k)-[:BELONGS_TO]->(d)
             RETURN k, elementId(k) AS id`,
            params,
          );
        });

        const record = result.records[0];
        const props = normalizeProperties(record.get("k").properties);
        const node = {
          id: record.get("id"),
          ...excludeEmbedding(props),
        };

        const durationMs = performance.now() - start;
        logToolCall(logger, "create_knowledge_node", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(node, null, 2) },
          ],
        };
      } catch (err) {
        const durationMs = performance.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logToolCall(
          logger,
          "create_knowledge_node",
          input,
          durationMs,
          errorMsg,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to create knowledge node: ${errorMsg}`,
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
  // update_knowledge_node — PATCH semantics with conditional re-embedding
  // -------------------------------------------------------------------------
  server.tool(
    "update_knowledge_node",
    UpdateKnowledgeNodeInput.shape,
    async (input) => {
      const start = performance.now();
      const { id, domain_slug, evidence, ...fields } = input;
      const session = driver.session();

      try {
        // Verify node exists
        const existingResult = await session.executeRead(async (tx) => {
          return tx.run(
            `MATCH (k:KnowledgeNode)
             WHERE elementId(k) = $id
             RETURN k, elementId(k) AS id`,
            { id },
          );
        });

        if (existingResult.records.length === 0) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "update_knowledge_node",
            input,
            durationMs,
            `Node not found: ${id}`,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `Error: KnowledgeNode with id "${id}" not found`,
              },
            ],
            isError: true,
          };
        }

        const existingProps = existingResult.records[0].get("k").properties;

        // Determine if re-embedding is needed
        const needsReEmbed =
          fields.definition !== undefined || fields.summary !== undefined;

        let embedding: number[] | undefined;
        if (needsReEmbed) {
          const newDefinition = fields.definition ?? existingProps.definition;
          const newSummary = fields.summary ?? existingProps.summary;
          embedding = await embedForStorage(
            embeddingClient,
            newDefinition,
            newSummary,
          );
        }

        const freshnessDate = new Date().toISOString();

        // Build SET clauses dynamically (PATCH semantics)
        const setClauses: string[] = ["k.freshness_date = $freshnessDate"];
        const params: Record<string, unknown> = { id, freshnessDate };

        if (fields.title !== undefined) {
          setClauses.push("k.title = $title");
          params.title = fields.title;
        }
        if (fields.summary !== undefined) {
          setClauses.push("k.summary = $summary");
          params.summary = fields.summary;
        }
        if (fields.definition !== undefined) {
          setClauses.push("k.definition = $definition");
          params.definition = fields.definition;
        }
        if (fields.claim_type !== undefined) {
          setClauses.push("k.claim_type = $claimType");
          params.claimType = fields.claim_type;
        }
        if (fields.confidence !== undefined) {
          setClauses.push("k.confidence = $confidence");
          params.confidence = fields.confidence;
        }
        if (fields.deep_content !== undefined) {
          setClauses.push("k.deep_content = $deepContent");
          params.deepContent = fields.deep_content;
        }
        if (evidence !== undefined) {
          setClauses.push("k.evidence = $evidence");
          params.evidence = JSON.stringify(evidence);
        }
        if (fields.conditions !== undefined) {
          setClauses.push("k.conditions = $conditions");
          params.conditions = fields.conditions;
        }
        if (fields.temporal_range !== undefined) {
          setClauses.push("k.temporal_range = $temporalRange");
          params.temporalRange = fields.temporal_range;
        }
        if (fields.geographic_scope !== undefined) {
          setClauses.push("k.geographic_scope = $geographicScope");
          params.geographicScope = fields.geographic_scope;
        }
        if (embedding !== undefined) {
          setClauses.push("k.embedding = $embedding");
          params.embedding = embedding;
        }

        // Handle domain_slug change
        let domainUpdateClause = "";
        if (domain_slug !== undefined) {
          // Verify new domain exists
          const domainCheck = await session.executeRead(async (tx) => {
            return tx.run(`MATCH (d:Domain {slug: $domainSlug}) RETURN d`, {
              domainSlug: domain_slug,
            });
          });

          if (domainCheck.records.length === 0) {
            const durationMs = performance.now() - start;
            logToolCall(
              logger,
              "update_knowledge_node",
              input,
              durationMs,
              `Domain not found: ${domain_slug}`,
            );

            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Domain with slug "${domain_slug}" not found`,
                },
              ],
              isError: true,
            };
          }

          params.newDomainSlug = domain_slug;
          domainUpdateClause = `
            WITH k
            OPTIONAL MATCH (k)-[oldRel:BELONGS_TO]->(:Domain)
            DELETE oldRel
            WITH k
            MATCH (newDomain:Domain {slug: $newDomainSlug})
            CREATE (k)-[:BELONGS_TO]->(newDomain)`;
        }

        const setClause = setClauses.join(", ");

        const result = await session.executeWrite(async (tx) => {
          return tx.run(
            `MATCH (k:KnowledgeNode)
             WHERE elementId(k) = $id
             SET ${setClause}
             ${domainUpdateClause}
             RETURN k, elementId(k) AS id`,
            params,
          );
        });

        const record = result.records[0];
        const props = normalizeProperties(record.get("k").properties);
        const node = {
          id: record.get("id"),
          ...excludeEmbedding(props),
        };

        const durationMs = performance.now() - start;
        logToolCall(logger, "update_knowledge_node", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(node, null, 2) },
          ],
        };
      } catch (err) {
        const durationMs = performance.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logToolCall(
          logger,
          "update_knowledge_node",
          input,
          durationMs,
          errorMsg,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to update knowledge node: ${errorMsg}`,
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
  // delete_knowledge_node — remove node and all relationships
  // -------------------------------------------------------------------------
  server.tool("delete_knowledge_node", DeleteInput.shape, async (input) => {
    const start = performance.now();
    const { id } = input;
    const session = driver.session();

    try {
      // Verify node exists
      const existingResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (k:KnowledgeNode)
           WHERE elementId(k) = $id
           RETURN k.title AS title`,
          { id },
        );
      });

      if (existingResult.records.length === 0) {
        const durationMs = performance.now() - start;
        logToolCall(
          logger,
          "delete_knowledge_node",
          input,
          durationMs,
          `Node not found: ${id}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: KnowledgeNode with id "${id}" not found`,
            },
          ],
          isError: true,
        };
      }

      const title = existingResult.records[0].get("title");

      await session.executeWrite(async (tx) => {
        return tx.run(
          `MATCH (k:KnowledgeNode)
           WHERE elementId(k) = $id
           DETACH DELETE k`,
          { id },
        );
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "delete_knowledge_node", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `KnowledgeNode "${title}" deleted successfully`,
                id,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "delete_knowledge_node", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to delete knowledge node: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
