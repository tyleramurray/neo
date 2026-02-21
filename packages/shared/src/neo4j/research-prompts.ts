// =============================================================================
// @neo/shared — ResearchPrompt Neo4j CRUD operations
// =============================================================================
// Create, read, update, list, and status-transition operations for
// ResearchPrompt nodes in the research pipeline.
// =============================================================================

import crypto from "node:crypto";
import { toNumber, type Session } from "./driver.js";
import type {
  ResearchPrompt,
  ResearchPromptStatus,
  ResearchPromptSource,
} from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps Neo4j record properties to a ResearchPrompt. */
function toResearchPrompt(
  props: Record<string, unknown>,
): ResearchPrompt & { id: string } {
  return {
    id: props.id as string,
    title: props.title as string,
    prompt_text: props.prompt_text as string,
    full_prompt: (props.full_prompt as string) ?? undefined,
    status: props.status as ResearchPromptStatus,
    priority: toNumber(props.priority),
    source: props.source as ResearchPromptSource,
    domain_slug: props.domain_slug as string,
    master_domain: props.master_domain as string,
    research_output: (props.research_output as string) ?? undefined,
    research_word_count:
      props.research_word_count != null
        ? toNumber(props.research_word_count)
        : undefined,
    created_date: (props.created_date as string) ?? undefined,
    researched_date: (props.researched_date as string) ?? undefined,
    completed_date: (props.completed_date as string) ?? undefined,
    error_message: (props.error_message as string) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Creates a :ResearchPrompt node and a TARGETS relationship to the Domain.
 * Uses MERGE on title+domain_slug to prevent duplicates.
 */
export async function createResearchPrompt(
  session: Session,
  prompt: Omit<
    ResearchPrompt,
    | "full_prompt"
    | "research_output"
    | "research_word_count"
    | "researched_date"
    | "completed_date"
    | "error_message"
  > & {
    full_prompt?: string;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const createdDate = new Date().toISOString();

  const result = await session.executeWrite(async (tx) => {
    return tx.run(
      `MERGE (rp:ResearchPrompt {title: $title, domain_slug: $domain_slug})
       ON CREATE SET
         rp.id = $id,
         rp.prompt_text = $prompt_text,
         rp.full_prompt = $full_prompt,
         rp.status = $status,
         rp.priority = $priority,
         rp.source = $source,
         rp.master_domain = $master_domain,
         rp.created_date = $created_date
       ON MATCH SET
         rp.prompt_text = $prompt_text,
         rp.full_prompt = $full_prompt,
         rp.status = $status,
         rp.priority = $priority,
         rp.source = $source
       WITH rp
       OPTIONAL MATCH (d:Domain {slug: $domain_slug})
       FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |
         MERGE (rp)-[:TARGETS]->(d)
       )
       RETURN rp.id AS id`,
      {
        id,
        title: prompt.title,
        prompt_text: prompt.prompt_text,
        full_prompt: prompt.full_prompt ?? null,
        status: prompt.status,
        priority: prompt.priority,
        source: prompt.source,
        domain_slug: prompt.domain_slug,
        master_domain: prompt.master_domain,
        created_date: createdDate,
      },
    );
  });

  return result.records[0].get("id") as string;
}

/**
 * Updates an existing :ResearchPrompt node by ID.
 * Only fields present in the updates object are modified.
 */
export async function updateResearchPrompt(
  session: Session,
  id: string,
  updates: Partial<ResearchPrompt>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  const fields: Array<[keyof ResearchPrompt, string]> = [
    ["title", "rp.title = $title"],
    ["prompt_text", "rp.prompt_text = $prompt_text"],
    ["full_prompt", "rp.full_prompt = $full_prompt"],
    ["status", "rp.status = $status"],
    ["priority", "rp.priority = $priority"],
    ["source", "rp.source = $source"],
    ["domain_slug", "rp.domain_slug = $domain_slug"],
    ["master_domain", "rp.master_domain = $master_domain"],
    ["research_output", "rp.research_output = $research_output"],
    ["research_word_count", "rp.research_word_count = $research_word_count"],
    ["created_date", "rp.created_date = $created_date"],
    ["researched_date", "rp.researched_date = $researched_date"],
    ["completed_date", "rp.completed_date = $completed_date"],
    ["error_message", "rp.error_message = $error_message"],
  ];

  for (const [key, clause] of fields) {
    if (updates[key] !== undefined) {
      setClauses.push(clause);
      params[key] = updates[key];
    }
  }

  if (setClauses.length === 0) return;

  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (rp:ResearchPrompt {id: $id}) SET ${setClauses.join(", ")}`,
      params,
    );
  });
}

/**
 * Retrieves a single :ResearchPrompt node by ID.
 */
export async function getResearchPrompt(
  session: Session,
  id: string,
): Promise<(ResearchPrompt & { id: string }) | null> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(`MATCH (rp:ResearchPrompt {id: $id}) RETURN rp`, { id });
  });

  if (result.records.length === 0) return null;

  const props = result.records[0].get("rp").properties as Record<
    string,
    unknown
  >;
  return toResearchPrompt(props);
}

/**
 * Lists :ResearchPrompt nodes with filtering and pagination.
 * Sorted by priority DESC (highest priority first).
 */
export async function listResearchPrompts(
  session: Session,
  opts: {
    status?: ResearchPromptStatus;
    domain_slug?: string;
    source?: ResearchPromptSource;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Array<ResearchPrompt & { id: string }>> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const whereClauses: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (opts.status) {
    whereClauses.push("rp.status = $status");
    params.status = opts.status;
  }
  if (opts.domain_slug) {
    whereClauses.push("rp.domain_slug = $domain_slug");
    params.domain_slug = opts.domain_slug;
  }
  if (opts.source) {
    whereClauses.push("rp.source = $source");
    params.source = opts.source;
  }

  const whereStr =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (rp:ResearchPrompt)
       ${whereStr}
       RETURN rp
       ORDER BY rp.priority DESC
       SKIP $offset
       LIMIT $limit`,
      params,
    );
  });

  return result.records.map((record) => {
    const props = record.get("rp").properties as Record<string, unknown>;
    return toResearchPrompt(props);
  });
}

/**
 * Gets the next highest-priority prompt that is ready for research.
 * Returns the prompt plus the count of remaining ready prompts.
 */
export async function getNextPrompt(session: Session): Promise<{
  prompt: (ResearchPrompt & { id: string }) | null;
  remainingCount: number;
}> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `OPTIONAL MATCH (rp:ResearchPrompt {status: "ready_for_research"})
       WITH rp ORDER BY rp.priority DESC
       WITH collect(rp) AS all, count(rp) AS total
       RETURN total,
              CASE WHEN total > 0 THEN all[0] ELSE null END AS next`,
    );
  });

  if (result.records.length === 0) {
    return { prompt: null, remainingCount: 0 };
  }

  const record = result.records[0];
  const total = toNumber(record.get("total"));
  const next = record.get("next");

  if (next === null) {
    return { prompt: null, remainingCount: 0 };
  }

  const props = next.properties as Record<string, unknown>;
  return {
    prompt: toResearchPrompt(props),
    remainingCount: total - 1,
  };
}

/**
 * Aggregates ResearchPrompt counts grouped by status.
 */
export async function countByStatus(
  session: Session,
): Promise<Record<string, number>> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (rp:ResearchPrompt)
       RETURN rp.status AS status, count(rp) AS count`,
    );
  });

  const counts: Record<string, number> = {};
  for (const record of result.records) {
    counts[record.get("status") as string] = toNumber(record.get("count"));
  }
  return counts;
}

/**
 * Aggregates ResearchPrompt counts grouped by domain_slug and status.
 */
export async function countByDomainAndStatus(
  session: Session,
): Promise<Array<{ domain_slug: string; status: string; count: number }>> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (rp:ResearchPrompt)
       RETURN rp.domain_slug AS domain_slug, rp.status AS status, count(rp) AS count
       ORDER BY domain_slug, status`,
    );
  });

  return result.records.map((record) => ({
    domain_slug: record.get("domain_slug") as string,
    status: record.get("status") as string,
    count: toNumber(record.get("count")),
  }));
}

/**
 * Transitions a ResearchPrompt to a new status with optional field updates.
 * Automatically sets date fields based on status transitions.
 */
export async function setPromptStatus(
  session: Session,
  id: string,
  status: ResearchPromptStatus,
  extras?: {
    research_output?: string;
    research_word_count?: number;
    error_message?: string;
  },
): Promise<void> {
  const setClauses: string[] = ["rp.status = $status"];
  const params: Record<string, unknown> = { id, status };

  // Auto-set date fields based on status transition
  if (status === "researched") {
    setClauses.push("rp.researched_date = $researched_date");
    params.researched_date = new Date().toISOString();
  }
  if (status === "completed") {
    setClauses.push("rp.completed_date = $completed_date");
    params.completed_date = new Date().toISOString();
  }

  // Apply optional extras
  if (extras?.research_output !== undefined) {
    setClauses.push("rp.research_output = $research_output");
    params.research_output = extras.research_output;
  }
  if (extras?.research_word_count !== undefined) {
    setClauses.push("rp.research_word_count = $research_word_count");
    params.research_word_count = extras.research_word_count;
  }
  if (extras?.error_message !== undefined) {
    setClauses.push("rp.error_message = $error_message");
    params.error_message = extras.error_message;
  }

  await session.executeWrite(async (tx) => {
    await tx.run(
      `MATCH (rp:ResearchPrompt {id: $id}) SET ${setClauses.join(", ")}`,
      params,
    );
  });
}
