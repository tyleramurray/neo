// =============================================================================
// @neo/server — Retrieval tool: query_knowledge
// =============================================================================
// MCP tool that embeds a natural-language query, runs vector search + graph
// traversal via the shared retrieval function, and formats results as
// human-readable text with a ~8K token budget.
// =============================================================================

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  QueryKnowledgeInput,
  embedText,
  queryKnowledgeGraph,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";
import type { RetrievedNode } from "@neo/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate token budget: ~4 chars per token, 8K tokens = 32K chars */
const TOKEN_BUDGET_CHARS = 32_000;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Formats a single retrieved node into the v1 human-readable template.
 */
function formatNode(node: RetrievedNode): string {
  const lines: string[] = [];

  lines.push(`## ${node.title} (score: ${node.score.toFixed(2)})`);
  lines.push(node.definition);
  lines.push(`- Confidence: ${node.confidence ?? "N/A"}`);
  lines.push(`- Claim type: ${node.claim_type ?? "N/A"}`);

  if (node.related.length > 0) {
    lines.push("");
    lines.push("Related:");
    for (const rel of node.related) {
      const stanceStr = rel.stance ? ` ${rel.stance}` : "";
      const mechanismStr = rel.mechanism ? `: ${rel.mechanism}` : "";
      lines.push(
        `- [${rel.relationshipType}${stanceStr}] ${rel.title}${mechanismStr}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Formats all results in BFS order: highest-scored results LAST
 * (closest to LLM's attention window). Applies token budget by
 * truncating lowest-scored results first.
 */
function formatResults(nodes: RetrievedNode[], warnings: string[]): string {
  if (nodes.length === 0) {
    return "No knowledge nodes match this query. The graph may need more content in this area.";
  }

  // BFS ordering: lowest score first, highest score last
  // Nodes are already sorted by score DESC from the query, so reverse them
  const bfsOrdered = [...nodes].reverse();

  // Format all nodes
  const formattedNodes = bfsOrdered.map(formatNode);

  // Apply token budget: if total exceeds budget, remove from the beginning
  // (lowest-scored results) since they're first in the BFS order
  let totalChars = 0;
  const budgetNodes: string[] = [];

  // Build from the end (highest-scored) to ensure those are always included
  for (let i = formattedNodes.length - 1; i >= 0; i--) {
    const nodeText = formattedNodes[i];
    if (
      totalChars + nodeText.length > TOKEN_BUDGET_CHARS &&
      budgetNodes.length > 0
    ) {
      // Would exceed budget and we already have results — stop adding
      break;
    }
    totalChars += nodeText.length;
    budgetNodes.unshift(nodeText);
  }

  const parts: string[] = [];

  // Prepend warning if all results are low confidence
  if (warnings.length > 0) {
    for (const warning of warnings) {
      parts.push(`\u26a0\ufe0f ${warning}`);
    }
    parts.push("");
  }

  parts.push(budgetNodes.join("\n\n"));

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerRetrievalTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, embeddingClient, logger } = deps;

  // -------------------------------------------------------------------------
  // query_knowledge — vector search + graph traversal for RAG
  // -------------------------------------------------------------------------
  server.tool("query_knowledge", QueryKnowledgeInput.shape, async (input) => {
    const start = performance.now();
    const { query, top_k = 10, domain_filter } = input;

    try {
      // Step 1: Embed the query
      const queryVector = await embedText(
        embeddingClient,
        query,
        "RETRIEVAL_QUERY",
      );

      // Step 2: Run vector search + graph traversal
      const result = await queryKnowledgeGraph(driver, queryVector, {
        topK: top_k,
        domainFilter: domain_filter,
      });

      // Step 3: Format response
      const formattedResponse = formatResults(result.nodes, result.warnings);

      const durationMs = performance.now() - start;
      logToolCall(logger, "query_knowledge", input, durationMs);

      return {
        content: [{ type: "text" as const, text: formattedResponse }],
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToolCall(logger, "query_knowledge", input, durationMs, errorMsg);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to query knowledge graph: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  });
};
