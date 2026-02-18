// =============================================================================
// @neo/shared — Vector search + relationship traversal for RAG retrieval
// =============================================================================
// Pure retrieval logic with no MCP dependency. Takes a Neo4j driver and a
// pre-computed query vector, returns structured results with related nodes
// from 1-hop relationship traversal across all four relationship categories.
// =============================================================================

import type { Driver } from "./driver.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrievalResult {
  nodes: RetrievedNode[];
  warnings: string[];
}

export interface RetrievedNode {
  id: string;
  title: string;
  definition: string;
  summary: string;
  confidence?: number;
  claim_type?: string;
  score: number;
  related: RelatedNode[];
}

export interface RelatedNode {
  id: string;
  title: string;
  definition: string;
  relationshipType: string; // CAUSAL, EPISTEMIC, CONTEXTUAL, STRUCTURAL
  stance?: string; // e.g., "supports", "contradicts", "positive"
  mechanism?: string;
}

export interface RetrievalOptions {
  topK: number;
  domainFilter?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the stance/direction property from a relationship's properties
 * based on its type. Each relationship category uses a different property
 * name for its "stance-like" field.
 */
function extractStance(
  relType: string,
  props: Record<string, unknown>,
): string | undefined {
  switch (relType) {
    case "CAUSAL":
      return props.direction as string | undefined;
    case "EPISTEMIC":
      return props.stance as string | undefined;
    case "CONTEXTUAL":
      return props.scope as string | undefined;
    case "STRUCTURAL":
      return props.hierarchy as string | undefined;
    default:
      return undefined;
  }
}

/**
 * Converts a Neo4j Integer to a JS number if needed.
 */
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main retrieval function
// ---------------------------------------------------------------------------

export async function queryKnowledgeGraph(
  driver: Driver,
  queryVector: number[],
  options: RetrievalOptions,
): Promise<RetrievalResult> {
  const { topK, domainFilter } = options;
  const session = driver.session();

  try {
    const domainFilterClause = domainFilter
      ? `WHERE EXISTS { (node)-[:BELONGS_TO]->(:Domain {slug: $domainFilter}) }`
      : "";

    const params: Record<string, unknown> = {
      topK,
      queryVector,
    };
    if (domainFilter) {
      params.domainFilter = domainFilter;
    }

    const cypher = `
      CALL db.index.vector.queryNodes('knowledge_embedding', $topK, $queryVector)
      YIELD node, score
      ${domainFilterClause}
      OPTIONAL MATCH (node)-[r]-(related:KnowledgeNode)
      WHERE type(r) IN ['CAUSAL', 'EPISTEMIC', 'CONTEXTUAL', 'STRUCTURAL']
      RETURN node, score, elementId(node) as nodeId,
             collect({
               node: related,
               id: elementId(related),
               type: type(r),
               props: properties(r)
             }) as relatedNodes
      ORDER BY score DESC
    `;

    const result = await session.executeRead(async (tx) => {
      return tx.run(cypher, params);
    });

    const warnings: string[] = [];
    const nodes: RetrievedNode[] = [];

    for (const record of result.records) {
      const nodeProps = record.get("node").properties as Record<
        string,
        unknown
      >;
      const nodeId = record.get("nodeId") as string;
      const score = record.get("score") as number;

      const rawRelated = record.get("relatedNodes") as Array<{
        node: { properties: Record<string, unknown> } | null;
        id: string | null;
        type: string | null;
        props: Record<string, unknown> | null;
      }>;

      // Deduplicate related nodes by id (multiple relationships to same node
      // would produce duplicate entries in the collect)
      const seenRelatedIds = new Set<string>();
      const related: RelatedNode[] = [];

      for (const rel of rawRelated) {
        // Skip nulls from OPTIONAL MATCH when no relationships exist
        if (!rel.node || !rel.id || !rel.type) continue;
        if (seenRelatedIds.has(rel.id)) continue;
        seenRelatedIds.add(rel.id);

        const nodeProps = rel.node.properties;
        const edgeProps = rel.props ?? {};

        related.push({
          id: rel.id,
          title: nodeProps.title as string,
          definition: nodeProps.definition as string,
          relationshipType: rel.type,
          stance: extractStance(rel.type, edgeProps),
          mechanism: edgeProps.mechanism as string | undefined,
        });
      }

      nodes.push({
        id: nodeId,
        title: nodeProps.title as string,
        definition: nodeProps.definition as string,
        summary: nodeProps.summary as string,
        confidence: toNumber(nodeProps.confidence),
        claim_type: nodeProps.claim_type as string | undefined,
        score,
        related,
      });
    }

    // Low confidence warning
    if (nodes.length > 0 && nodes.every((n) => n.score < 0.5)) {
      warnings.push(
        "Low confidence results — the graph may not have strong coverage of this topic.",
      );
    }

    return { nodes, warnings };
  } finally {
    await session.close();
  }
}
