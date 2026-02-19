// =============================================================================
// @neo/server — Synthesis tools: synthesize_research, synthesize_dry_run,
//                                synthesize_review, synthesize_batch
// =============================================================================
// Registers synthesis MCP tools:
// - synthesize_research: full synthesis pipeline (extract -> embed -> ingest)
// - synthesize_dry_run: preview extraction without persisting
// - synthesize_review: review log for synthesis history
// - synthesize_batch: process multiple research texts sequentially
// =============================================================================

import crypto from "node:crypto";
import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type SynthesisPrompt,
  type SynthesisResult,
  type SynthesisRunRecord,
  extractClaims,
  ingestNodes,
  ingestRelationships,
  createSynthesisRun,
  updateSynthesisRun,
  listSynthesisRuns,
  embedForStorage,
  SynthesizeBatchInputSchema,
  toNumber,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// MCP tool input schema (snake_case convention)
// ---------------------------------------------------------------------------

const SynthesizeResearchInput = z.object({
  text: z.string().min(1).max(100000).describe("Research text to synthesize"),
  domain_slug: z.string().min(1).describe("Target domain slug"),
  master_domain_slug: z.string().optional().describe("Master domain slug"),
  source: z.string().max(500).optional().describe("Source attribution"),
});

const SynthesizeReviewInput = z.object({
  domain_slug: z
    .string()
    .optional()
    .describe("Filter by domain slug (omit for all domains)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results to return (default: 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Pagination offset (default: 0)"),
  include_warnings: z
    .boolean()
    .optional()
    .describe(
      "Include full warning strings and potential duplicate nodes (default: false)",
    ),
});

// ---------------------------------------------------------------------------
// Helpers — shared across synthesize_research and synthesize_dry_run
// ---------------------------------------------------------------------------

/** Verifies a domain exists in Neo4j. Returns true if found. */
async function verifyDomainExists(
  session: import("neo4j-driver").Session,
  domainSlug: string,
): Promise<boolean> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(`MATCH (d:Domain {slug: $domainSlug}) RETURN d`, {
      domainSlug,
    });
  });
  return result.records.length > 0;
}

/**
 * Fetches the active SynthesisPrompt from Neo4j for the given master domain.
 * Falls back to a sensible default if none found.
 */
async function fetchSynthesisPrompt(
  session: import("neo4j-driver").Session,
  masterDomain: string,
): Promise<SynthesisPrompt> {
  const result = await session.executeRead(async (tx) => {
    return tx.run(
      `MATCH (sp:SynthesisPrompt {status: 'active', master_domain: $masterDomain})
       RETURN sp ORDER BY sp.version DESC LIMIT 1`,
      { masterDomain },
    );
  });

  if (result.records.length > 0) {
    const props = result.records[0].get("sp").properties as Record<
      string,
      unknown
    >;
    return {
      version: toNumber(props.version) || 1,
      master_domain: props.master_domain as string,
      effective_date: props.effective_date as string,
      prompt_text: props.prompt_text as string,
      target_schema_version: toNumber(props.target_schema_version) || 1,
      status: props.status as SynthesisPrompt["status"],
    };
  }

  return {
    version: 1,
    master_domain: masterDomain,
    effective_date: new Date().toISOString(),
    prompt_text:
      "You are a knowledge extraction specialist. Extract structured knowledge claims from the provided research text. Each claim should be atomic, well-defined, and supported by evidence from the text.",
    target_schema_version: 1,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerSynthesisTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, embeddingClient, anthropicClient, logger } = deps;

  /** Embed helper bound to the shared embeddingClient for ingestNodes. */
  const embedFn = (text: string): Promise<number[]> =>
    embedForStorage(embeddingClient, text, "");

  // -------------------------------------------------------------------------
  // synthesize_research — full synthesis pipeline
  // -------------------------------------------------------------------------
  server.tool(
    "synthesize_research",
    SynthesizeResearchInput.shape,
    async (input) => {
      const start = performance.now();
      const { text, domain_slug, master_domain_slug, source } = input;
      const session = driver.session();

      // Generate input hash for SynthesisRun tracking
      const inputHash = crypto.createHash("sha256").update(text).digest("hex");

      // Prepare the SynthesisRun ID up front so we can update it on error
      const runId = crypto.randomUUID();

      // Track whether any work was persisted (for partial vs failed status)
      let nodesIngested = 0;

      try {
        // Step 1: Verify domain exists
        const domainExists = await verifyDomainExists(session, domain_slug);
        if (!domainExists) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "synthesize_research",
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

        // Step 2: Get SynthesisPrompt from Neo4j (or use fallback)
        const masterDomain = master_domain_slug ?? domain_slug;
        const synthesisPrompt = await fetchSynthesisPrompt(
          session,
          masterDomain,
        );

        // Step 3: Create SynthesisRun with status 'partial' (pending not in union)
        const initialRun: SynthesisRunRecord = {
          id: runId,
          inputHash,
          domainSlug: domain_slug,
          status: "partial",
          nodesCreated: 0,
          relationshipsCreated: 0,
          duplicateWarnings: 0,
          createdAt: new Date().toISOString(),
          errors: [],
        };

        await createSynthesisRun(session, initialRun);

        // Step 4: Extract claims via Claude
        const claims = await extractClaims(
          anthropicClient,
          {
            text,
            domainSlug: domain_slug,
            masterDomainSlug: master_domain_slug,
            source,
          },
          synthesisPrompt,
        );

        // Step 5: If no claims extracted, update run to completed with 0 counts
        if (claims.length === 0) {
          await updateSynthesisRun(session, runId, {
            status: "completed",
            completedAt: new Date().toISOString(),
          });

          const result: SynthesisResult = {
            runId,
            domainSlug: domain_slug,
            claims: [],
            nodesCreated: 0,
            relationshipsCreated: 0,
            duplicatesFound: 0,
            warnings: ["No claims extracted from input text"],
          };

          const durationMs = performance.now() - start;
          logToolCall(logger, "synthesize_research", input, durationMs);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Step 6: Embed and ingest nodes
        const ingestResult = await ingestNodes(
          session,
          claims,
          domain_slug,
          embedFn,
        );

        nodesIngested = ingestResult.nodesCreated + ingestResult.nodesMerged;

        // Step 7: Build nodeIdMap from ingest results for relationship creation
        const nodeIdMap = new Map<string, string>();
        for (let i = 0; i < claims.length; i++) {
          if (ingestResult.nodeIds[i]) {
            nodeIdMap.set(claims[i].title, ingestResult.nodeIds[i]);
          }
        }

        // Step 8: Ingest relationships
        const relResult = await ingestRelationships(session, claims, nodeIdMap);

        // Step 9: Update SynthesisRun to completed
        await updateSynthesisRun(session, runId, {
          status: "completed",
          nodesCreated: ingestResult.nodesCreated,
          relationshipsCreated: relResult.relationshipsCreated,
          duplicateWarnings: ingestResult.duplicatesFound,
          completedAt: new Date().toISOString(),
        });

        // Step 10: Return SynthesisResult
        const result: SynthesisResult = {
          runId,
          domainSlug: domain_slug,
          claims,
          nodesCreated: ingestResult.nodesCreated,
          relationshipsCreated: relResult.relationshipsCreated,
          duplicatesFound: ingestResult.duplicatesFound,
          warnings: [...ingestResult.warnings, ...relResult.warnings],
        };

        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_research", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        // Step 12: On error, update SynthesisRun to failed or partial
        const errorMsg = err instanceof Error ? err.message : String(err);

        try {
          await updateSynthesisRun(session, runId, {
            status: nodesIngested > 0 ? "partial" : "failed",
            errors: [errorMsg],
            completedAt: new Date().toISOString(),
          });
        } catch {
          // If we can't even update the run, log and continue
          logger.error("Failed to update SynthesisRun on error", {
            runId,
            error: errorMsg,
          });
        }

        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_research", input, durationMs, errorMsg);

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Synthesis failed: ${errorMsg}`,
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
  // synthesize_dry_run — preview extraction without persisting
  // -------------------------------------------------------------------------
  server.tool(
    "synthesize_dry_run",
    SynthesizeResearchInput.shape,
    async (input) => {
      const start = performance.now();
      const { text, domain_slug, master_domain_slug, source } = input;
      const session = driver.session();

      try {
        // Step 1: Verify domain exists
        const domainExists = await verifyDomainExists(session, domain_slug);
        if (!domainExists) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "synthesize_dry_run",
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

        // Step 2: Get SynthesisPrompt from Neo4j (or use fallback)
        const masterDomain = master_domain_slug ?? domain_slug;
        const synthesisPrompt = await fetchSynthesisPrompt(
          session,
          masterDomain,
        );

        // Step 3: Extract claims via Claude (NO persistence)
        const claims = await extractClaims(
          anthropicClient,
          {
            text,
            domainSlug: domain_slug,
            masterDomainSlug: master_domain_slug,
            source,
          },
          synthesisPrompt,
        );

        // Step 4: Return claims directly — no SynthesisRun, no embedding, no ingestion
        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_dry_run", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  dryRun: true,
                  domainSlug: domain_slug,
                  claimsExtracted: claims.length,
                  claims,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_dry_run", input, durationMs, errorMsg);

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Dry run failed: ${errorMsg}`,
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
  // synthesize_review — review log for synthesis history
  // -------------------------------------------------------------------------
  server.tool(
    "synthesize_review",
    SynthesizeReviewInput.shape,
    async (input) => {
      const start = performance.now();
      const { domain_slug, limit, offset, include_warnings } = input;
      const session = driver.session();

      try {
        // Step 1: List synthesis runs (newest first, paginated)
        const runs = await listSynthesisRuns(session, {
          domainSlug: domain_slug,
          limit: limit ?? 20,
          offset: offset ?? 0,
        });

        // Step 2: Build response for each run
        const results = [];

        for (const run of runs) {
          const entry: Record<string, unknown> = {
            runId: run.id,
            domain: run.domainSlug,
            status: run.status,
            timestamp: run.createdAt,
            completedAt: run.completedAt ?? null,
            nodesCreated: run.nodesCreated,
            relationshipsCreated: run.relationshipsCreated,
            duplicateWarnings: run.duplicateWarnings,
          };

          // Step 3: If include_warnings, add errors and query duplicate nodes
          if (include_warnings) {
            entry.errors = run.errors;

            const dupResult = await session.executeRead(async (tx) => {
              return tx.run(
                `MATCH (n:KnowledgeNode {potential_duplicate: true})
                 WHERE n.freshness_date >= $runCreatedAt
                 RETURN n.title AS title, n.id AS nodeId`,
                { runCreatedAt: run.createdAt },
              );
            });

            entry.potentialDuplicates = dupResult.records.map((record) => ({
              title: record.get("title") as string,
              nodeId: record.get("nodeId") as string,
            }));
          }

          results.push(entry);
        }

        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_review", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  runs: results,
                  count: results.length,
                  limit: limit ?? 20,
                  offset: offset ?? 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_review", input, durationMs, errorMsg);

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Review query failed: ${errorMsg}`,
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
  // synthesize_batch — process multiple research texts sequentially
  // -------------------------------------------------------------------------
  server.tool(
    "synthesize_batch",
    SynthesizeBatchInputSchema.shape,
    async (input) => {
      const start = performance.now();
      const { items, domain_slug, master_domain_slug } = input;
      const session = driver.session();

      // Aggregated results
      const runIds: string[] = [];
      const errors: Array<{ itemIndex: number; error: string }> = [];
      const warnings: string[] = [];
      let totalNodesCreated = 0;
      let totalRelationshipsCreated = 0;
      let totalDuplicatesFound = 0;

      try {
        // Step 1: Verify domain exists (once for the whole batch)
        const domainExists = await verifyDomainExists(session, domain_slug);
        if (!domainExists) {
          const durationMs = performance.now() - start;
          logToolCall(
            logger,
            "synthesize_batch",
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

        // Step 2: Get SynthesisPrompt (once for the whole batch)
        const masterDomain = master_domain_slug ?? domain_slug;
        const synthesisPrompt = await fetchSynthesisPrompt(
          session,
          masterDomain,
        );

        // Step 3: Process items sequentially to avoid rate limits
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const runId = crypto.randomUUID();
          const inputHash = crypto
            .createHash("sha256")
            .update(item.text)
            .digest("hex");
          let nodesIngested = 0;

          try {
            // 3a: Create SynthesisRun for this item
            const initialRun: SynthesisRunRecord = {
              id: runId,
              inputHash,
              domainSlug: domain_slug,
              status: "partial",
              nodesCreated: 0,
              relationshipsCreated: 0,
              duplicateWarnings: 0,
              createdAt: new Date().toISOString(),
              errors: [],
            };
            await createSynthesisRun(session, initialRun);

            // 3b: Extract claims via Claude
            const claims = await extractClaims(
              anthropicClient,
              {
                text: item.text,
                domainSlug: domain_slug,
                masterDomainSlug: master_domain_slug,
                source: item.source,
              },
              synthesisPrompt,
            );

            // 3c: If no claims, mark completed with 0 counts
            if (claims.length === 0) {
              await updateSynthesisRun(session, runId, {
                status: "completed",
                completedAt: new Date().toISOString(),
              });
              runIds.push(runId);
              warnings.push(`Item ${i}: No claims extracted from input text`);
              continue;
            }

            // 3d: Embed and ingest nodes
            const ingestResult = await ingestNodes(
              session,
              claims,
              domain_slug,
              embedFn,
            );

            nodesIngested =
              ingestResult.nodesCreated + ingestResult.nodesMerged;

            // 3e: Build nodeIdMap for relationship creation
            const nodeIdMap = new Map<string, string>();
            for (let j = 0; j < claims.length; j++) {
              if (ingestResult.nodeIds[j]) {
                nodeIdMap.set(claims[j].title, ingestResult.nodeIds[j]);
              }
            }

            // 3f: Ingest relationships
            const relResult = await ingestRelationships(
              session,
              claims,
              nodeIdMap,
            );

            // 3g: Collect warnings from this item
            for (const w of [...ingestResult.warnings, ...relResult.warnings]) {
              warnings.push(`Item ${i}: ${w}`);
            }

            // 3h: Update SynthesisRun to completed
            await updateSynthesisRun(session, runId, {
              status: "completed",
              nodesCreated: ingestResult.nodesCreated,
              relationshipsCreated: relResult.relationshipsCreated,
              duplicateWarnings: ingestResult.duplicatesFound,
              completedAt: new Date().toISOString(),
            });

            // 3i: Accumulate totals
            totalNodesCreated += ingestResult.nodesCreated;
            totalRelationshipsCreated += relResult.relationshipsCreated;
            totalDuplicatesFound += ingestResult.duplicatesFound;
            runIds.push(runId);
          } catch (err) {
            // Item-level error: log, update run, continue to next item
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push({ itemIndex: i, error: errorMsg });

            try {
              await updateSynthesisRun(session, runId, {
                status: nodesIngested > 0 ? "partial" : "failed",
                errors: [errorMsg],
                completedAt: new Date().toISOString(),
              });
            } catch {
              logger.error(
                "Failed to update SynthesisRun on batch item error",
                { runId, itemIndex: i, error: errorMsg },
              );
            }

            // Still record the runId so caller can inspect it
            runIds.push(runId);
          }
        }

        // Step 4: Return aggregated results
        const succeeded = items.length - errors.length;
        const result = {
          totalItems: items.length,
          succeeded,
          failed: errors.length,
          totalNodesCreated,
          totalRelationshipsCreated,
          totalDuplicatesFound,
          runIds,
          errors,
          warnings,
        };

        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_batch", input, durationMs);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        // Batch-level error (e.g., domain check or prompt fetch failed)
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = performance.now() - start;
        logToolCall(logger, "synthesize_batch", input, durationMs, errorMsg);

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Batch synthesis failed: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      } finally {
        await session.close();
      }
    },
  );
};
