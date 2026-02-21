// =============================================================================
// @neo/server — Review tools for research prompt approval workflow
// =============================================================================
// Registers MCP tools for reviewing auto-generated research prompts:
// - get_items_for_review: list prompts needing human review
// - approve_research_prompt: approve one or all pending prompts
// - reject_research_prompt: reject a prompt
// =============================================================================

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listResearchPrompts,
  setPromptStatus,
  getResearchPrompt,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ApproveInput = z.object({
  prompt_id: z
    .string()
    .min(1)
    .optional()
    .describe("Specific prompt ID to approve (omit with all=true for bulk)"),
  all: z
    .boolean()
    .optional()
    .describe("Approve all needs_review prompts (default: false)"),
});

const RejectInput = z.object({
  prompt_id: z.string().min(1).describe("Prompt ID to reject"),
});

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerReviewTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, logger } = deps;

  // -------------------------------------------------------------------------
  // get_items_for_review
  // -------------------------------------------------------------------------
  server.tool("get_items_for_review", {}, async () => {
    const start = performance.now();
    const session = driver.session();

    try {
      const prompts = await listResearchPrompts(session, {
        status: "needs_review",
        limit: 100,
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "get_items_for_review", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: prompts.length,
                prompts: prompts.map((p) => ({
                  id: p.id,
                  title: p.title,
                  prompt_text: p.prompt_text,
                  domain_slug: p.domain_slug,
                  priority: p.priority,
                  source: p.source,
                  created_date: p.created_date,
                })),
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
      logToolCall(logger, "get_items_for_review", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // approve_research_prompt
  // -------------------------------------------------------------------------
  server.tool("approve_research_prompt", ApproveInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();

    try {
      if (input.all) {
        // Bulk approve all "needs_review" prompts
        const prompts = await listResearchPrompts(session, {
          status: "needs_review",
          limit: 100,
        });

        let approved = 0;
        for (const p of prompts) {
          await setPromptStatus(session, p.id, "queued");
          approved++;
        }

        const durationMs = performance.now() - start;
        logToolCall(logger, "approve_research_prompt", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { approved, message: `Approved ${approved} prompts` },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Single prompt approval
      if (!input.prompt_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Provide prompt_id or set all=true for bulk approval",
            },
          ],
          isError: true,
        };
      }

      const prompt = await getResearchPrompt(session, input.prompt_id);
      if (!prompt) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Research prompt "${input.prompt_id}" not found`,
            },
          ],
          isError: true,
        };
      }

      if (prompt.status !== "needs_review") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Prompt "${input.prompt_id}" is "${prompt.status}", not "needs_review"`,
            },
          ],
          isError: true,
        };
      }

      await setPromptStatus(session, input.prompt_id, "queued");

      const durationMs = performance.now() - start;
      logToolCall(logger, "approve_research_prompt", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: input.prompt_id,
                title: prompt.title,
                previousStatus: "needs_review",
                newStatus: "queued",
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
      logToolCall(
        logger,
        "approve_research_prompt",
        input,
        durationMs,
        errorMsg,
      );

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // reject_research_prompt
  // -------------------------------------------------------------------------
  server.tool("reject_research_prompt", RejectInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();

    try {
      const prompt = await getResearchPrompt(session, input.prompt_id);
      if (!prompt) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Research prompt "${input.prompt_id}" not found`,
            },
          ],
          isError: true,
        };
      }

      if (prompt.status !== "needs_review") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Prompt "${input.prompt_id}" is "${prompt.status}", not "needs_review"`,
            },
          ],
          isError: true,
        };
      }

      await setPromptStatus(session, input.prompt_id, "rejected");

      const durationMs = performance.now() - start;
      logToolCall(logger, "reject_research_prompt", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: input.prompt_id,
                title: prompt.title,
                previousStatus: "needs_review",
                newStatus: "rejected",
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
      logToolCall(
        logger,
        "reject_research_prompt",
        input,
        durationMs,
        errorMsg,
      );

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
