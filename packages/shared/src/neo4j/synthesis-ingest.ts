// =============================================================================
// @neo/shared — Batch node ingestion with MERGE and vector dedup flagging
// =============================================================================
// Ingests ExtractedClaim[] into the Neo4j knowledge graph using MERGE for
// idempotency and vector similarity queries to flag potential duplicates.
// =============================================================================

import crypto from "node:crypto";
import { toNumber, type Session } from "./driver.js";
import type {
  ExtractedClaim,
  IngestResult,
  RelIngestResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cosine similarity threshold above which nodes are flagged as potential duplicates */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.88;

/** Number of nearest neighbors to check for duplicates */
const DUPLICATE_QUERY_TOP_K = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic ID from title + domain slug for idempotency.
 * Uses SHA-256 truncated to 36 hex characters.
 */
function generateDeterministicId(title: string, domainSlug: string): string {
  return crypto
    .createHash("sha256")
    .update(title + "\0" + domainSlug)
    .digest("hex")
    .slice(0, 36);
}

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingests an array of extracted claims into the Neo4j knowledge graph.
 *
 * For each claim:
 * 1. Generates an embedding via the provided embedFn
 * 2. Generates a deterministic node ID from title + domain slug
 * 3. MERGEs the KnowledgeNode by title + domain BELONGS_TO relationship
 * 4. SETs all properties including the embedding
 * 5. Runs a vector similarity check against existing nodes in the same domain
 * 6. Flags potential duplicates (score > 0.88) on the node
 *
 * @param session - Neo4j session (caller manages lifecycle)
 * @param claims - Extracted claims to ingest
 * @param domainSlug - Target domain slug for BELONGS_TO relationship
 * @param embedFn - Async function that produces an embedding vector for a text string
 * @returns IngestResult with counts, warnings, and node IDs
 */
export async function ingestNodes(
  session: Session,
  claims: ExtractedClaim[],
  domainSlug: string,
  embedFn: (text: string) => Promise<number[]>,
): Promise<IngestResult> {
  const result: IngestResult = {
    nodesCreated: 0,
    nodesMerged: 0,
    duplicatesFound: 0,
    warnings: [],
    nodeIds: [],
  };

  const now = new Date().toISOString();

  for (const claim of claims) {
    // 1. Generate embedding
    const embeddingText = `${claim.title}: ${claim.definition}`;
    const embedding = await embedFn(embeddingText);

    // 2. Generate deterministic ID
    const nodeId = generateDeterministicId(claim.title, domainSlug);

    // 3. MERGE node by title + domain BELONGS_TO, SET all properties
    const mergeResult = await session.executeWrite(async (tx) => {
      return tx.run(
        `MATCH (d:Domain {slug: $domainSlug})
         MERGE (n:KnowledgeNode {title: $title})-[:BELONGS_TO]->(d)
         ON CREATE SET
           n.id = $id,
           n.summary = $summary,
           n.definition = $definition,
           n.embedding = $embedding,
           n.confidence = $confidence,
           n.claim_type = $claimType,
           n.status = 'active',
           n.freshness_date = $freshnessDate,
           n.potential_duplicate = false,
           n.evidence = $evidence,
           n._just_created = true
         ON MATCH SET
           n.summary = $summary,
           n.definition = $definition,
           n.embedding = $embedding,
           n.confidence = $confidence,
           n.claim_type = $claimType,
           n.freshness_date = $freshnessDate,
           n.evidence = $evidence,
           n._just_created = false
         RETURN n.id AS nodeId, n._just_created AS wasCreated`,
        {
          domainSlug,
          title: claim.title,
          id: nodeId,
          summary: claim.summary,
          definition: claim.definition,
          embedding,
          confidence: claim.confidence,
          claimType: claim.claimType,
          freshnessDate: now,
          evidence: JSON.stringify(claim.evidence),
        },
      );
    });

    if (mergeResult.records.length === 0) {
      result.warnings.push(
        `Domain '${domainSlug}' not found — skipped claim '${claim.title}'`,
      );
      continue;
    }

    const returnedNodeId = mergeResult.records[0].get("nodeId") as string;
    const wasCreated = mergeResult.records[0].get("wasCreated") as boolean;

    result.nodeIds.push(returnedNodeId);
    if (wasCreated) {
      result.nodesCreated++;
    } else {
      result.nodesMerged++;
    }

    // 5. Vector similarity check against existing nodes in the same domain
    const dupResult = await session.executeRead(async (tx) => {
      return tx.run(
        `CALL db.index.vector.queryNodes('knowledge_embedding', $topK, $embedding)
         YIELD node, score
         WHERE score > $threshold AND node.title <> $title
         MATCH (node)-[:BELONGS_TO]->(:Domain {slug: $domainSlug})
         RETURN node.title AS existingTitle, score`,
        {
          topK: DUPLICATE_QUERY_TOP_K,
          embedding,
          threshold: DUPLICATE_SIMILARITY_THRESHOLD,
          title: claim.title,
          domainSlug,
        },
      );
    });

    if (dupResult.records.length > 0) {
      // 6. Flag as potential duplicate
      await session.executeWrite(async (tx) => {
        await tx.run(
          `MATCH (n:KnowledgeNode {id: $nodeId})
           SET n.potential_duplicate = true`,
          { nodeId: returnedNodeId },
        );
      });

      result.duplicatesFound++;
      const duplicateTitles = dupResult.records.map((rec) => {
        const existingTitle = rec.get("existingTitle") as string;
        const score = rec.get("score") as number;
        return `'${existingTitle}' (score: ${score.toFixed(3)})`;
      });
      result.warnings.push(
        `Potential duplicate: '${claim.title}' similar to ${duplicateTitles.join(", ")}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relationship categories — Neo4j can't parameterise relationship types, so
// we need a dedicated Cypher query per category.
// ---------------------------------------------------------------------------

const RELATIONSHIP_CATEGORIES = [
  "CAUSAL",
  "EPISTEMIC",
  "CONTEXTUAL",
  "STRUCTURAL",
] as const;

type RelationshipCategory = (typeof RELATIONSHIP_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Relationship ingestion helpers
// ---------------------------------------------------------------------------

interface RelBatchItem {
  sourceId: string;
  targetTitle: string;
  type: string;
  stance: string;
  strength: number;
}

/**
 * Groups all relationships from claims by their category, flattening the
 * nested claim → relationship structure into per-category arrays ready for
 * UNWIND batch creation.
 */
function groupRelationshipsByCategory(
  claims: ExtractedClaim[],
  nodeIdMap: Map<string, string>,
): Map<RelationshipCategory, RelBatchItem[]> {
  const groups = new Map<RelationshipCategory, RelBatchItem[]>();

  for (const category of RELATIONSHIP_CATEGORIES) {
    groups.set(category, []);
  }

  for (const claim of claims) {
    const sourceId = nodeIdMap.get(claim.title);
    if (!sourceId) continue;

    for (const rel of claim.relationships) {
      const category = rel.category.toUpperCase() as RelationshipCategory;
      const batch = groups.get(category);
      if (!batch) continue; // unknown category — will be caught in the caller

      batch.push({
        sourceId,
        targetTitle: rel.targetTitle,
        type: rel.type,
        stance: rel.stance,
        strength: rel.strength,
      });
    }
  }

  return groups;
}

/**
 * Resolves a target node ID by title. Tries exact match first, then falls
 * back to case-insensitive CONTAINS within the same domain.
 *
 * Returns the node ID if found, or null if no match.
 */
async function resolveTargetNode(
  session: Session,
  targetTitle: string,
  nodeIdMap: Map<string, string>,
): Promise<string | null> {
  // Fast path: check the nodeIdMap for an exact match (same batch)
  const directMatch = nodeIdMap.get(targetTitle);
  if (directMatch) return directMatch;

  // Exact title match in the graph
  const exactResult = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (n:KnowledgeNode {title: $title})
       RETURN n.id AS nodeId
       LIMIT 1`,
      { title: targetTitle },
    );
  });

  if (exactResult.records.length > 0) {
    return exactResult.records[0].get("nodeId") as string;
  }

  // Case-insensitive CONTAINS fallback
  const fuzzyResult = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (n:KnowledgeNode)
       WHERE toLower(n.title) CONTAINS toLower($title)
       RETURN n.id AS nodeId
       LIMIT 1`,
      { title: targetTitle },
    );
  });

  if (fuzzyResult.records.length > 0) {
    return fuzzyResult.records[0].get("nodeId") as string;
  }

  return null;
}

/**
 * Builds a Cypher UNWIND query for a given relationship category.
 * Each category gets a literal relationship type in the query.
 */
function buildBatchCypherForCategory(category: RelationshipCategory): string {
  return `
    UNWIND $rels AS rel
    MATCH (source:KnowledgeNode {id: rel.sourceId})
    MATCH (target:KnowledgeNode {id: rel.targetId})
    CREATE (source)-[:${category} {
      type: rel.type,
      stance: rel.stance,
      strength: rel.strength,
      source: 'synthesis'
    }]->(target)
    RETURN count(*) AS created
  `;
}

// ---------------------------------------------------------------------------
// Batch relationship creation
// ---------------------------------------------------------------------------

/**
 * Ingests relationships between KnowledgeNodes in the graph.
 *
 * For each claim's relationships:
 * 1. Resolves the source node from nodeIdMap
 * 2. Resolves the target node by title (exact match, then case-insensitive CONTAINS fallback)
 * 3. Groups resolved relationships by category (CAUSAL, EPISTEMIC, CONTEXTUAL, STRUCTURAL)
 * 4. Batch-creates relationships per category using UNWIND
 *
 * @param session - Neo4j session (caller manages lifecycle)
 * @param claims - Extracted claims whose relationships to ingest
 * @param nodeIdMap - Map of claim title to Neo4j node ID (from ingestNodes)
 * @returns RelIngestResult with counts and warnings
 */
export async function ingestRelationships(
  session: Session,
  claims: ExtractedClaim[],
  nodeIdMap: Map<string, string>,
): Promise<RelIngestResult> {
  const result: RelIngestResult = {
    relationshipsCreated: 0,
    relationshipsSkipped: 0,
    warnings: [],
  };

  // Step 1: Group all relationships by category
  const groups = groupRelationshipsByCategory(claims, nodeIdMap);

  // Step 2: Resolve target nodes and build final batch items per category
  const resolvedGroups = new Map<
    RelationshipCategory,
    {
      sourceId: string;
      targetId: string;
      type: string;
      stance: string;
      strength: number;
    }[]
  >();

  for (const category of RELATIONSHIP_CATEGORIES) {
    resolvedGroups.set(category, []);
  }

  for (const [category, items] of groups) {
    const resolved = resolvedGroups.get(category)!;

    for (const item of items) {
      const targetId = await resolveTargetNode(
        session,
        item.targetTitle,
        nodeIdMap,
      );

      if (!targetId) {
        result.relationshipsSkipped++;
        result.warnings.push(
          `Target node not found for relationship: '${item.targetTitle}' (category: ${category}, source ID: ${item.sourceId})`,
        );
        continue;
      }

      resolved.push({
        sourceId: item.sourceId,
        targetId,
        type: item.type,
        stance: item.stance,
        strength: item.strength,
      });
    }
  }

  // Step 3: Batch-create relationships per category using UNWIND
  for (const category of RELATIONSHIP_CATEGORIES) {
    const rels = resolvedGroups.get(category)!;
    if (rels.length === 0) continue;

    const cypher = buildBatchCypherForCategory(category);
    const batchResult = await session.executeWrite(async (tx) => {
      return tx.run(cypher, { rels });
    });

    if (batchResult.records.length > 0) {
      result.relationshipsCreated += toNumber(
        batchResult.records[0].get("created"),
      );
    }
  }

  return result;
}
