// =============================================================================
// @neo/server — Admin tools: health_check, schema_info, graph_stats
// =============================================================================
// Registers three MCP tools for system health monitoring, schema inspection,
// and graph statistics. All queries use session.executeRead() for automatic
// retry on transient failures.
// =============================================================================

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { healthCheck, embeddingHealthCheck } from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerAdminTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, embeddingClient, logger } = deps;

  // -------------------------------------------------------------------------
  // health_check — parallel Neo4j + Gemini connectivity check
  // -------------------------------------------------------------------------
  server.tool("health_check", {}, async () => {
    const start = performance.now();
    try {
      const [neo4jResult, geminiResult] = await Promise.all([
        healthCheck(driver),
        embeddingHealthCheck(embeddingClient),
      ]);

      const allOk = neo4jResult.ok && geminiResult.ok;
      const anyOk = neo4jResult.ok || geminiResult.ok;
      const status = allOk ? "ok" : anyOk ? "degraded" : "unhealthy";

      const result = {
        status,
        neo4j: neo4jResult,
        gemini: geminiResult,
        uptime: process.uptime(),
      };

      const durationMs = performance.now() - start;
      logToolCall(logger, "health_check", {}, durationMs);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "health_check", {}, durationMs, errorMsg);

      return {
        content: [
          { type: "text" as const, text: `Health check failed: ${errorMsg}` },
        ],
        isError: true,
      };
    }
  });

  // -------------------------------------------------------------------------
  // schema_info — read NodeType and RelationshipCategory from Neo4j
  // -------------------------------------------------------------------------
  server.tool("schema_info", {}, async () => {
    const start = performance.now();
    const session = driver.session();
    try {
      const result = await session.executeRead(async (tx) => {
        const [nodeTypesResult, relCategoriesResult] = await Promise.all([
          tx.run("MATCH (n:NodeType) RETURN n ORDER BY n.label"),
          tx.run("MATCH (r:RelationshipCategory) RETURN r ORDER BY r.category"),
        ]);

        const nodeTypes = nodeTypesResult.records.map((record) => {
          const props = record.get("n").properties;
          return {
            label: props.label,
            tier: props.tier,
            version:
              typeof props.version === "object" && "toNumber" in props.version
                ? (props.version as { toNumber: () => number }).toNumber()
                : props.version,
            required_properties: props.required_properties,
            standard_properties: props.standard_properties,
            extended_properties: props.extended_properties,
            description: props.description,
          };
        });

        const relationshipCategories = relCategoriesResult.records.map(
          (record) => {
            const props = record.get("r").properties;
            return {
              category: props.category,
              version:
                typeof props.version === "object" && "toNumber" in props.version
                  ? (props.version as { toNumber: () => number }).toNumber()
                  : props.version,
              valid_stances: props.valid_stances,
              required_properties: props.required_properties,
              description: props.description,
              reasoning_hint: props.reasoning_hint,
            };
          },
        );

        return { nodeTypes, relationshipCategories };
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "schema_info", {}, durationMs);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "schema_info", {}, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Schema info query failed: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // graph_stats — node counts, relationship counts, vector index status
  // -------------------------------------------------------------------------
  server.tool("graph_stats", {}, async () => {
    const start = performance.now();
    const session = driver.session();
    try {
      const result = await session.executeRead(async (tx) => {
        // Node labels to count
        const nodeLabels = [
          "MasterDomain",
          "Domain",
          "KnowledgeNode",
          "NodeType",
          "RelationshipCategory",
          "SynthesisPrompt",
        ];

        // Relationship types to count
        const relTypes = [
          "HAS_DOMAIN",
          "CAUSAL",
          "EPISTEMIC",
          "CONTEXTUAL",
          "STRUCTURAL",
        ];

        // Build parallel queries for node counts
        const nodeCountQueries = nodeLabels.map((label) =>
          tx.run(`MATCH (n:\`${label}\`) RETURN count(n) AS count`),
        );

        // Build parallel queries for relationship counts
        const relCountQueries = relTypes.map((type) =>
          tx.run(`MATCH ()-[r:\`${type}\`]->() RETURN count(r) AS count`),
        );

        // Vector index query
        const vectorIndexQuery = tx.run("SHOW INDEXES WHERE type = 'VECTOR'");

        // Run all in parallel
        const allResults = await Promise.all([
          ...nodeCountQueries,
          ...relCountQueries,
          vectorIndexQuery,
        ]);

        // Parse node counts
        const nodeCounts: Record<string, number> = {};
        nodeLabels.forEach((label, i) => {
          const count = allResults[i].records[0]?.get("count");
          nodeCounts[label] =
            typeof count === "object" && count !== null && "toNumber" in count
              ? (count as { toNumber: () => number }).toNumber()
              : Number(count ?? 0);
        });

        // Parse relationship counts
        const relationshipCounts: Record<string, number> = {};
        relTypes.forEach((type, i) => {
          const idx = nodeLabels.length + i;
          const count = allResults[idx].records[0]?.get("count");
          relationshipCounts[type] =
            typeof count === "object" && count !== null && "toNumber" in count
              ? (count as { toNumber: () => number }).toNumber()
              : Number(count ?? 0);
        });

        // Parse vector index info
        const vectorIndexIdx = nodeLabels.length + relTypes.length;
        const vectorIndexRecords = allResults[vectorIndexIdx].records;
        const vectorIndexes = vectorIndexRecords.map((record) => {
          const keys = record.keys;
          const entry: Record<string, unknown> = {};
          for (const key of keys) {
            if (typeof key !== "string") continue;
            const val = record.get(key);
            entry[key] =
              typeof val === "object" && val !== null && "toNumber" in val
                ? (val as { toNumber: () => number }).toNumber()
                : val;
          }
          return entry;
        });

        return { nodeCounts, relationshipCounts, vectorIndexes };
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "graph_stats", {}, durationMs);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "graph_stats", {}, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Graph stats query failed: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
