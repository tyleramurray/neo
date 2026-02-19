// =============================================================================
// @neo/shared — SynthesisRun Neo4j CRUD operations
// =============================================================================
// Create, read, update, and list SynthesisRun nodes for audit/tracking of
// synthesis pipeline executions.
// =============================================================================

import crypto from "node:crypto";
import { toNumber, type Session } from "./driver.js";
import type { SynthesisRunRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

/**
 * Maps a Neo4j record's properties to a SynthesisRunRecord.
 */
function toSynthesisRunRecord(
  props: Record<string, unknown>,
): SynthesisRunRecord {
  return {
    id: props.id as string,
    inputHash: props.inputHash as string,
    domainSlug: props.domainSlug as string,
    status: props.status as SynthesisRunRecord["status"],
    nodesCreated: toNumber(props.nodesCreated),
    relationshipsCreated: toNumber(props.relationshipsCreated),
    duplicateWarnings: toNumber(props.duplicateWarnings),
    createdAt: props.createdAt as string,
    completedAt: (props.completedAt as string) ?? undefined,
    errors: safeParseJsonArray(props.errors as string),
  };
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Creates a :SynthesisRun node in Neo4j.
 *
 * @param session - Neo4j session
 * @param run - The synthesis run record to persist
 * @returns The ID of the created node
 */
export async function createSynthesisRun(
  session: Session,
  run: SynthesisRunRecord,
): Promise<string> {
  const id = run.id || crypto.randomUUID();
  const createdAt = run.createdAt || new Date().toISOString();

  await session.executeWrite(async (tx) => {
    await tx.run(
      `CREATE (sr:SynthesisRun {
        id: $id,
        inputHash: $inputHash,
        domainSlug: $domainSlug,
        status: $status,
        nodesCreated: $nodesCreated,
        relationshipsCreated: $relationshipsCreated,
        duplicateWarnings: $duplicateWarnings,
        errors: $errors,
        createdAt: $createdAt,
        completedAt: $completedAt
      })`,
      {
        id,
        inputHash: run.inputHash,
        domainSlug: run.domainSlug,
        status: run.status,
        nodesCreated: run.nodesCreated,
        relationshipsCreated: run.relationshipsCreated,
        duplicateWarnings: run.duplicateWarnings,
        errors: JSON.stringify(run.errors),
        createdAt,
        completedAt: run.completedAt ?? null,
      },
    );
  });

  return id;
}

/**
 * Updates an existing :SynthesisRun node. Only fields present in the updates
 * object are modified.
 *
 * @param session - Neo4j session
 * @param runId - The ID of the run to update
 * @param updates - Partial record with fields to update
 */
export async function updateSynthesisRun(
  session: Session,
  runId: string,
  updates: Partial<SynthesisRunRecord>,
): Promise<void> {
  // Build SET clauses dynamically from the updates object
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id: runId };

  if (updates.inputHash !== undefined) {
    setClauses.push("sr.inputHash = $inputHash");
    params.inputHash = updates.inputHash;
  }
  if (updates.domainSlug !== undefined) {
    setClauses.push("sr.domainSlug = $domainSlug");
    params.domainSlug = updates.domainSlug;
  }
  if (updates.status !== undefined) {
    setClauses.push("sr.status = $status");
    params.status = updates.status;
  }
  if (updates.nodesCreated !== undefined) {
    setClauses.push("sr.nodesCreated = $nodesCreated");
    params.nodesCreated = updates.nodesCreated;
  }
  if (updates.relationshipsCreated !== undefined) {
    setClauses.push("sr.relationshipsCreated = $relationshipsCreated");
    params.relationshipsCreated = updates.relationshipsCreated;
  }
  if (updates.duplicateWarnings !== undefined) {
    setClauses.push("sr.duplicateWarnings = $duplicateWarnings");
    params.duplicateWarnings = updates.duplicateWarnings;
  }
  if (updates.errors !== undefined) {
    setClauses.push("sr.errors = $errors");
    params.errors = JSON.stringify(updates.errors);
  }
  if (updates.createdAt !== undefined) {
    setClauses.push("sr.createdAt = $createdAt");
    params.createdAt = updates.createdAt;
  }
  if (updates.completedAt !== undefined) {
    setClauses.push("sr.completedAt = $completedAt");
    params.completedAt = updates.completedAt;
  }

  if (setClauses.length === 0) return;

  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (sr:SynthesisRun {id: $id}) SET ${setClauses.join(", ")}`,
      params,
    );
  });
}

/**
 * Retrieves a single :SynthesisRun node by ID.
 *
 * @param session - Neo4j session
 * @param runId - The ID of the run to retrieve
 * @returns The synthesis run record, or null if not found
 */
export async function getSynthesisRun(
  session: Session,
  runId: string,
): Promise<SynthesisRunRecord | null> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(`MATCH (sr:SynthesisRun {id: $id}) RETURN sr`, { id: runId });
  });

  if (result.records.length === 0) return null;

  const props = result.records[0].get("sr").properties as Record<
    string,
    unknown
  >;
  return toSynthesisRunRecord(props);
}

/**
 * Lists :SynthesisRun nodes with optional domain filter and pagination.
 * Results are ordered newest-first by createdAt.
 *
 * @param session - Neo4j session
 * @param opts - Filter and pagination options
 * @returns Array of synthesis run records
 */
export async function listSynthesisRuns(
  session: Session,
  opts: { domainSlug?: string; limit?: number; offset?: number } = {},
): Promise<SynthesisRunRecord[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const whereClause = opts.domainSlug
    ? "WHERE sr.domainSlug = $domainSlug"
    : "";

  const params: Record<string, unknown> = {
    limit,
    offset,
  };
  if (opts.domainSlug) {
    params.domainSlug = opts.domainSlug;
  }

  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (sr:SynthesisRun)
       ${whereClause}
       RETURN sr
       ORDER BY sr.createdAt DESC
       SKIP $offset
       LIMIT $limit`,
      params,
    );
  });

  return result.records.map((record) => {
    const props = record.get("sr").properties as Record<string, unknown>;
    return toSynthesisRunRecord(props);
  });
}
