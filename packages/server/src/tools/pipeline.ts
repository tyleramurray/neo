// =============================================================================
// @neo/server — Pipeline tools: gap detection, synthesis batch, monitoring
// =============================================================================
// Registers MCP tools for pipeline orchestration:
// - prepare_research_queue: assemble full prompts for queued items
// - run_synthesis_batch: process researched prompts into KnowledgeNodes
// - run_gap_detection: scan graph for knowledge gaps
// - run_daily_monitoring: compute freshness scores and pipeline health
// - coverage_health: per-domain health metrics
// =============================================================================

import crypto from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type SynthesisRunRecord,
  listResearchPrompts,
  setPromptStatus,
  updateResearchPrompt,
  createResearchPrompt,
  getResearchPrompt,
  extractClaims,
  ingestNodes,
  ingestRelationships,
  createSynthesisRun,
  updateSynthesisRun,
  embedForStorage,
  toNumber,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const RunSynthesisBatchInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max prompts to process (default: 20)"),
});

const CoverageHealthInput = z.object({
  domain_slug: z
    .string()
    .optional()
    .describe("Filter to specific domain (omit for all domains)"),
});

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerPipelineTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, embeddingClient, anthropicClient, templateEngine, logger } =
    deps;

  const embedFn = (text: string): Promise<number[]> =>
    embedForStorage(embeddingClient, text, "");

  // -------------------------------------------------------------------------
  // prepare_research_queue
  // -------------------------------------------------------------------------
  server.tool("prepare_research_queue", {}, async () => {
    const start = performance.now();
    const session = driver.session();

    try {
      // Get all "queued" prompts
      const prompts = await listResearchPrompts(session, {
        status: "queued",
        limit: 100,
      });

      let prepared = 0;
      for (const p of prompts) {
        // Assemble full prompt via template engine
        const fullPrompt = templateEngine.assembleFullPrompt(
          p.prompt_text,
          "ecom",
          p.source,
        );

        await updateResearchPrompt(session, p.id, {
          full_prompt: fullPrompt,
        });
        await setPromptStatus(session, p.id, "ready_for_research");
        prepared++;
      }

      const durationMs = performance.now() - start;
      logToolCall(logger, "prepare_research_queue", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                prepared,
                message: `${prepared} prompts prepared and ready for research`,
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
      logToolCall(logger, "prepare_research_queue", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // run_synthesis_batch
  // -------------------------------------------------------------------------
  server.tool(
    "run_synthesis_batch",
    RunSynthesisBatchInput.shape,
    async (input) => {
      const start = performance.now();
      const session = driver.session();
      const limit = input.limit ?? 20;

      const results: Array<{
        promptId: string;
        title: string;
        status: string;
        nodesCreated?: number;
        error?: string;
      }> = [];

      try {
        // Get "researched" prompts ready for synthesis
        const prompts = await listResearchPrompts(session, {
          status: "researched",
          limit,
        });

        if (prompts.length === 0) {
          const durationMs = performance.now() - start;
          logToolCall(logger, "run_synthesis_batch", input, durationMs);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  message: "No researched prompts to synthesize",
                  processed: 0,
                }),
              },
            ],
          };
        }

        // Fetch the synthesis prompt once for all items
        const spResult = await session.executeRead(async (tx) => {
          return tx.run(
            `MATCH (sp:SynthesisPrompt {status: 'active', master_domain: 'ecommerce'})
             RETURN sp ORDER BY sp.version DESC LIMIT 1`,
          );
        });

        const synthesisPrompt =
          spResult.records.length > 0
            ? (() => {
                const props = spResult.records[0].get("sp")
                  .properties as Record<string, unknown>;
                return {
                  version: toNumber(props.version) || 1,
                  master_domain: props.master_domain as string,
                  effective_date: props.effective_date as string,
                  prompt_text: props.prompt_text as string,
                  target_schema_version:
                    toNumber(props.target_schema_version) || 1,
                  status: props.status as "active",
                };
              })()
            : {
                version: 1,
                master_domain: "ecommerce",
                effective_date: new Date().toISOString(),
                prompt_text:
                  "You are a knowledge extraction specialist. Extract structured knowledge claims from the provided research text.",
                target_schema_version: 1,
                status: "active" as const,
              };

        // Process each prompt
        for (const p of prompts) {
          if (!p.research_output) {
            results.push({
              promptId: p.id,
              title: p.title,
              status: "skipped",
              error: "No research_output found",
            });
            continue;
          }

          try {
            // Mark as synthesizing
            await setPromptStatus(session, p.id, "synthesizing");

            // Create a SynthesisRun
            const runId = crypto.randomUUID();
            const inputHash = crypto
              .createHash("sha256")
              .update(p.research_output)
              .digest("hex");

            const initialRun: SynthesisRunRecord = {
              id: runId,
              inputHash,
              domainSlug: p.domain_slug,
              status: "partial",
              nodesCreated: 0,
              relationshipsCreated: 0,
              duplicateWarnings: 0,
              createdAt: new Date().toISOString(),
              errors: [],
            };
            await createSynthesisRun(session, initialRun);

            // Extract claims
            const claims = await extractClaims(
              anthropicClient,
              {
                text: p.research_output,
                domainSlug: p.domain_slug,
                masterDomainSlug: "ecommerce",
              },
              synthesisPrompt,
            );

            if (claims.length === 0) {
              await updateSynthesisRun(session, runId, {
                status: "completed",
                completedAt: new Date().toISOString(),
              });
              await setPromptStatus(session, p.id, "completed");
              results.push({
                promptId: p.id,
                title: p.title,
                status: "completed",
                nodesCreated: 0,
              });
              continue;
            }

            // Ingest nodes
            const ingestResult = await ingestNodes(
              session,
              claims,
              p.domain_slug,
              embedFn,
            );

            // Ingest relationships
            const nodeIdMap = new Map<string, string>();
            for (let i = 0; i < claims.length; i++) {
              if (ingestResult.nodeIds[i]) {
                nodeIdMap.set(claims[i].title, ingestResult.nodeIds[i]);
              }
            }
            const relResult = await ingestRelationships(
              session,
              claims,
              nodeIdMap,
            );

            // Update SynthesisRun
            await updateSynthesisRun(session, runId, {
              status: "completed",
              nodesCreated: ingestResult.nodesCreated,
              relationshipsCreated: relResult.relationshipsCreated,
              duplicateWarnings: ingestResult.duplicatesFound,
              completedAt: new Date().toISOString(),
            });

            // Create PRODUCED relationship from prompt to run
            await session.executeWrite(async (tx) => {
              await tx.run(
                `MATCH (rp:ResearchPrompt {id: $promptId})
                 MATCH (sr:SynthesisRun {id: $runId})
                 MERGE (rp)-[:PRODUCED]->(sr)`,
                { promptId: p.id, runId },
              );
            });

            // Mark prompt completed
            await setPromptStatus(session, p.id, "completed");

            results.push({
              promptId: p.id,
              title: p.title,
              status: "completed",
              nodesCreated: ingestResult.nodesCreated,
            });
          } catch (err) {
            // Item-level error: mark failed, continue
            const errorMsg = err instanceof Error ? err.message : String(err);
            try {
              await setPromptStatus(session, p.id, "failed", {
                error_message: errorMsg,
              });
            } catch {
              // If we can't update status, just log
            }
            results.push({
              promptId: p.id,
              title: p.title,
              status: "failed",
              error: errorMsg,
            });
          }
        }

        const succeeded = results.filter(
          (r) => r.status === "completed",
        ).length;
        const failed = results.filter((r) => r.status === "failed").length;
        const totalNodes = results.reduce(
          (acc, r) => acc + (r.nodesCreated ?? 0),
          0,
        );

        const durationMs = performance.now() - start;
        logToolCall(logger, "run_synthesis_batch", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  processed: results.length,
                  succeeded,
                  failed,
                  totalNodesCreated: totalNodes,
                  results,
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
        logToolCall(logger, "run_synthesis_batch", input, durationMs, errorMsg);

        return {
          content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
          isError: true,
        };
      } finally {
        await session.close();
      }
    },
  );

  // -------------------------------------------------------------------------
  // run_gap_detection
  // -------------------------------------------------------------------------
  server.tool("run_gap_detection", {}, async () => {
    const start = performance.now();
    const session = driver.session();
    const gaps: Array<{
      type: string;
      title: string;
      domain: string;
      priority: number;
    }> = [];
    let promptsCreated = 0;

    try {
      // 1. Find domains with fewer than 5 KnowledgeNodes
      const sparseResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (d:Domain)
           OPTIONAL MATCH (d)<-[:BELONGS_TO]-(kn:KnowledgeNode)
           WITH d, count(kn) AS nodeCount
           WHERE nodeCount < 5
           RETURN d.slug AS slug, d.title AS title, nodeCount`,
        );
      });

      for (const record of sparseResult.records) {
        const slug = record.get("slug") as string;
        const title = record.get("title") as string;
        const nodeCount = toNumber(record.get("nodeCount"));

        gaps.push({
          type: "sparse_domain",
          title: `Knowledge gap: ${title}`,
          domain: slug,
          priority: nodeCount === 0 ? 8 : 6,
        });

        // Check if we already have a pending prompt for this
        const existing = await session.executeRead(async (tx) => {
          return tx.run(
            `MATCH (rp:ResearchPrompt {domain_slug: $slug})
             WHERE rp.status IN ["queued", "needs_review", "ready_for_research"]
               AND rp.source = "gap_detection"
             RETURN rp.id AS id LIMIT 1`,
            { slug },
          );
        });

        if (existing.records.length === 0) {
          await createResearchPrompt(session, {
            title: `Foundation research: ${title}`,
            prompt_text: `Provide a comprehensive overview of "${title}" in the context of CPG ecommerce. Cover key concepts, current state, major trends, and practical implications for brand manufacturers.`,
            status: nodeCount === 0 ? "needs_review" : "needs_review",
            priority: nodeCount === 0 ? 8 : 6,
            source: "gap_detection",
            domain_slug: slug,
            master_domain: "ecommerce",
          });
          promptsCreated++;
        }
      }

      // 2. Find KnowledgeNodes with stale freshness (freshness_date older than 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const staleDate = sixMonthsAgo.toISOString();

      const staleResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (kn:KnowledgeNode)-[:BELONGS_TO]->(d:Domain)
           WHERE kn.freshness_date < $staleDate
           RETURN kn.title AS title, d.slug AS domain_slug, kn.freshness_date AS freshness_date
           LIMIT 20`,
          { staleDate },
        );
      });

      for (const record of staleResult.records) {
        const title = record.get("title") as string;
        const domainSlug = record.get("domain_slug") as string;

        gaps.push({
          type: "stale_knowledge",
          title: `Stale: ${title}`,
          domain: domainSlug,
          priority: 4,
        });

        // Check for existing prompt
        const existing = await session.executeRead(async (tx) => {
          return tx.run(
            `MATCH (rp:ResearchPrompt {domain_slug: $domainSlug})
             WHERE rp.status IN ["queued", "needs_review", "ready_for_research"]
               AND rp.source = "freshness_decay"
               AND rp.title CONTAINS $title
             RETURN rp.id AS id LIMIT 1`,
            { domainSlug, title },
          );
        });

        if (existing.records.length === 0) {
          await createResearchPrompt(session, {
            title: `Refresh: ${title}`,
            prompt_text: `Update our knowledge about "${title}". What has changed in the last 6-12 months? New developments, updated data, shifting trends.`,
            status: "needs_review",
            priority: 4,
            source: "freshness_decay",
            domain_slug: domainSlug,
            master_domain: "ecommerce",
          });
          promptsCreated++;
        }
      }

      // 3. Check CoverageTopics with status="gap"
      const coverageResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (ct:CoverageTopic {status: "gap"})-[:COVERS]->(d:Domain)
           RETURN ct.title AS title, d.slug AS domain_slug, ct.priority AS priority
           LIMIT 20`,
        );
      });

      for (const record of coverageResult.records) {
        const title = record.get("title") as string;
        const domainSlug = record.get("domain_slug") as string;
        const priority = record.get("priority") as string;
        const numPriority =
          priority === "critical" ? 9 : priority === "important" ? 7 : 5;

        gaps.push({
          type: "coverage_gap",
          title,
          domain: domainSlug,
          priority: numPriority,
        });

        const existing = await session.executeRead(async (tx) => {
          return tx.run(
            `MATCH (rp:ResearchPrompt {domain_slug: $domainSlug})
             WHERE rp.status IN ["queued", "needs_review", "ready_for_research"]
               AND rp.source = "coverage_map"
               AND rp.title CONTAINS $title
             RETURN rp.id AS id LIMIT 1`,
            { domainSlug, title },
          );
        });

        if (existing.records.length === 0) {
          await createResearchPrompt(session, {
            title: `Coverage gap: ${title}`,
            prompt_text: `Research "${title}" in depth for the ${domainSlug} domain. This topic has been identified as a gap in our knowledge graph.`,
            status: "needs_review",
            priority: numPriority,
            source: "coverage_map",
            domain_slug: domainSlug,
            master_domain: "ecommerce",
          });
          promptsCreated++;
        }
      }

      const durationMs = performance.now() - start;
      logToolCall(logger, "run_gap_detection", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                gapsFound: gaps.length,
                promptsCreated,
                gaps,
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
      logToolCall(logger, "run_gap_detection", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // run_daily_monitoring
  // -------------------------------------------------------------------------
  server.tool("run_daily_monitoring", {}, async () => {
    const start = performance.now();
    const session = driver.session();

    try {
      // Pipeline health: count prompts by status
      const pipelineResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (rp:ResearchPrompt)
           RETURN rp.status AS status, count(rp) AS count`,
        );
      });

      const pipeline: Record<string, number> = {};
      for (const record of pipelineResult.records) {
        pipeline[record.get("status") as string] = toNumber(
          record.get("count"),
        );
      }

      // Stuck items: prompts in non-terminal status for >7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const stuckDate = sevenDaysAgo.toISOString();

      const stuckResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (rp:ResearchPrompt)
           WHERE rp.status IN ["queued", "needs_review", "ready_for_research", "researched", "synthesizing"]
             AND rp.created_date < $stuckDate
           RETURN rp.id AS id, rp.title AS title, rp.status AS status, rp.created_date AS created_date`,
          { stuckDate },
        );
      });

      const stuckItems = stuckResult.records.map((r) => ({
        id: r.get("id") as string,
        title: r.get("title") as string,
        status: r.get("status") as string,
        created_date: r.get("created_date") as string,
      }));

      // Graph freshness: average freshness score using half-life decay
      // freshness = 2^(-days_since_update / half_life)  where half_life = 180 days
      const freshnessResult = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (kn:KnowledgeNode)
           WHERE kn.freshness_date IS NOT NULL
           WITH kn,
                duration.between(date(kn.freshness_date), date()).months +
                duration.between(date(kn.freshness_date), date()).days / 30.0 AS monthsOld
           RETURN avg(monthsOld) AS avgMonthsOld, count(kn) AS totalNodes`,
        );
      });

      let avgFreshness = 1.0;
      let totalNodes = 0;
      if (freshnessResult.records.length > 0) {
        const avgMonthsOld = toNumber(
          freshnessResult.records[0].get("avgMonthsOld"),
        );
        totalNodes = toNumber(freshnessResult.records[0].get("totalNodes"));
        // Half-life decay: 2^(-months/6) where 6 months = half-life
        avgFreshness = Math.pow(2, -avgMonthsOld / 6);
      }

      // Recent synthesis activity
      const recentRuns = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (sr:SynthesisRun)
           WHERE sr.createdAt > $weekAgo
           RETURN count(sr) AS count, sum(sr.nodesCreated) AS nodesCreated`,
          { weekAgo: stuckDate },
        );
      });

      let recentRunCount = 0;
      let recentNodesCreated = 0;
      if (recentRuns.records.length > 0) {
        recentRunCount = toNumber(recentRuns.records[0].get("count"));
        recentNodesCreated = toNumber(
          recentRuns.records[0].get("nodesCreated"),
        );
      }

      const durationMs = performance.now() - start;
      logToolCall(logger, "run_daily_monitoring", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pipeline,
                stuckItems: {
                  count: stuckItems.length,
                  items: stuckItems,
                },
                graphHealth: {
                  totalNodes,
                  avgFreshnessScore: Math.round(avgFreshness * 100) / 100,
                },
                recentActivity: {
                  synthesisRuns: recentRunCount,
                  nodesCreated: recentNodesCreated,
                },
                timestamp: new Date().toISOString(),
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
      logToolCall(logger, "run_daily_monitoring", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // coverage_health
  // -------------------------------------------------------------------------
  server.tool("coverage_health", CoverageHealthInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();

    try {
      const domainFilter = input.domain_slug
        ? "WHERE d.slug = $domain_slug"
        : "";
      const params: Record<string, unknown> = {};
      if (input.domain_slug) params.domain_slug = input.domain_slug;

      const result = await session.executeRead(async (tx) => {
        return tx.run(
          `MATCH (d:Domain)
             ${domainFilter}
             OPTIONAL MATCH (d)<-[:BELONGS_TO]-(kn:KnowledgeNode)
             WITH d,
                  count(kn) AS nodeCount,
                  avg(kn.confidence) AS avgConfidence,
                  avg(CASE WHEN kn.evidence_count IS NOT NULL THEN kn.evidence_count ELSE 0 END) AS avgEvidence
             RETURN d.slug AS slug, d.title AS title,
                    nodeCount, avgConfidence, avgEvidence
             ORDER BY nodeCount DESC`,
          params,
        );
      });

      const domains = result.records.map((record) => ({
        slug: record.get("slug") as string,
        title: record.get("title") as string,
        nodeCount: toNumber(record.get("nodeCount")),
        avgConfidence:
          Math.round((toNumber(record.get("avgConfidence")) || 0) * 100) / 100,
        avgEvidenceCount:
          Math.round((toNumber(record.get("avgEvidence")) || 0) * 10) / 10,
      }));

      const totalNodes = domains.reduce((acc, d) => acc + d.nodeCount, 0);
      const domainsWithContent = domains.filter((d) => d.nodeCount > 0).length;

      const durationMs = performance.now() - start;
      logToolCall(logger, "coverage_health", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalDomains: domains.length,
                domainsWithContent,
                totalNodes,
                domains,
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
      logToolCall(logger, "coverage_health", input, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
