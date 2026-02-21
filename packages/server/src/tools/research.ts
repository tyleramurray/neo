// =============================================================================
// @neo/server — Research execution tools
// =============================================================================
// Registers MCP tools for the research workflow:
// - create_research_prompt: manually create a research prompt
// - get_next_prompt: get highest-priority ready prompt
// - save_research_result: store research output text
// - skip_prompt: deprioritize a prompt
// - edit_prompt: update prompt text
// - research_queue_status: aggregate pipeline stats
// =============================================================================

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createResearchPrompt,
  getResearchPrompt,
  getNextPrompt,
  setPromptStatus,
  updateResearchPrompt,
  countByStatus,
  countByDomainAndStatus,
} from "@neo/shared";
import type { ToolRegistrar, AppDependencies } from "../server.js";
import { logToolCall } from "../logger.js";

// ---------------------------------------------------------------------------
// State: track last served prompt for default prompt_id
// ---------------------------------------------------------------------------

let lastServedPromptId: string | null = null;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateResearchPromptInput = z.object({
  title: z.string().min(1).max(300).describe("Title for the research prompt"),
  prompt_text: z
    .string()
    .min(1)
    .max(10000)
    .describe("The research question/topic"),
  domain_slug: z.string().min(1).describe("Target domain slug"),
  priority: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Priority (0-10, default 5)"),
});

const SaveResearchResultInput = z.object({
  prompt_id: z
    .string()
    .min(1)
    .optional()
    .describe("Prompt ID (defaults to last served by get_next_prompt)"),
  research_text: z
    .string()
    .min(1)
    .max(500000)
    .describe("Full research output text"),
});

const EditPromptInput = z.object({
  prompt_id: z.string().min(1).describe("Prompt ID to edit"),
  new_prompt_text: z.string().min(1).max(10000).describe("Updated prompt text"),
});

const PromptIdInput = z.object({
  prompt_id: z
    .string()
    .min(1)
    .optional()
    .describe("Prompt ID (defaults to last served by get_next_prompt)"),
});

// ---------------------------------------------------------------------------
// Tool registrar
// ---------------------------------------------------------------------------

export const registerResearchTools: ToolRegistrar = (
  server: McpServer,
  deps: AppDependencies,
) => {
  const { driver, templateEngine, logger } = deps;

  // -------------------------------------------------------------------------
  // create_research_prompt
  // -------------------------------------------------------------------------
  server.tool(
    "create_research_prompt",
    CreateResearchPromptInput.shape,
    async (input) => {
      const start = performance.now();
      const session = driver.session();

      try {
        const priority = input.priority ?? 5;

        // Assemble full prompt via template engine
        const fullPrompt = templateEngine.assembleFullPrompt(
          input.prompt_text,
          "ecom",
          "manual",
        );

        const id = await createResearchPrompt(session, {
          title: input.title,
          prompt_text: input.prompt_text,
          status: "queued",
          priority,
          source: "manual",
          domain_slug: input.domain_slug,
          master_domain: "ecommerce",
          full_prompt: fullPrompt,
        });

        const durationMs = performance.now() - start;
        logToolCall(logger, "create_research_prompt", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id,
                  title: input.title,
                  domain_slug: input.domain_slug,
                  status: "queued",
                  priority,
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
          "create_research_prompt",
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
    },
  );

  // -------------------------------------------------------------------------
  // get_next_prompt
  // -------------------------------------------------------------------------
  server.tool("get_next_prompt", {}, async () => {
    const start = performance.now();
    const session = driver.session();

    try {
      const { prompt, remainingCount } = await getNextPrompt(session);

      if (!prompt) {
        const durationMs = performance.now() - start;
        logToolCall(logger, "get_next_prompt", {}, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No prompts ready for research",
                remainingCount: 0,
              }),
            },
          ],
        };
      }

      // Track for default prompt_id
      lastServedPromptId = prompt.id;

      const durationMs = performance.now() - start;
      logToolCall(logger, "get_next_prompt", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: prompt.id,
                title: prompt.title,
                prompt_text: prompt.prompt_text,
                full_prompt: prompt.full_prompt,
                domain_slug: prompt.domain_slug,
                priority: prompt.priority,
                source: prompt.source,
                remainingCount,
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
      logToolCall(logger, "get_next_prompt", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // save_research_result
  // -------------------------------------------------------------------------
  server.tool(
    "save_research_result",
    SaveResearchResultInput.shape,
    async (input) => {
      const start = performance.now();
      const session = driver.session();

      try {
        const promptId = input.prompt_id ?? lastServedPromptId;
        if (!promptId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No prompt_id provided and no prompt was recently served by get_next_prompt",
              },
            ],
            isError: true,
          };
        }

        // Verify prompt exists
        const prompt = await getResearchPrompt(session, promptId);
        if (!prompt) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Research prompt "${promptId}" not found`,
              },
            ],
            isError: true,
          };
        }

        // Save research output and transition to "researched"
        const wordCount = input.research_text
          .split(/\s+/)
          .filter((w) => w.length > 0).length;

        await setPromptStatus(session, promptId, "researched", {
          research_output: input.research_text,
          research_word_count: wordCount,
        });

        const durationMs = performance.now() - start;
        logToolCall(logger, "save_research_result", input, durationMs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: promptId,
                  title: prompt.title,
                  status: "researched",
                  word_count: wordCount,
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
          "save_research_result",
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
    },
  );

  // -------------------------------------------------------------------------
  // skip_prompt
  // -------------------------------------------------------------------------
  server.tool("skip_prompt", PromptIdInput.shape, async (input) => {
    const start = performance.now();
    const session = driver.session();

    try {
      const promptId = input.prompt_id ?? lastServedPromptId;
      if (!promptId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No prompt_id provided and no prompt was recently served",
            },
          ],
          isError: true,
        };
      }

      const prompt = await getResearchPrompt(session, promptId);
      if (!prompt) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Research prompt "${promptId}" not found`,
            },
          ],
          isError: true,
        };
      }

      // Decrease priority by 0.1, floor at 0
      const newPriority = Math.max(0, prompt.priority - 0.1);
      await updateResearchPrompt(session, promptId, {
        priority: newPriority,
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "skip_prompt", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: promptId,
                title: prompt.title,
                previousPriority: prompt.priority,
                newPriority,
                status: prompt.status,
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
      logToolCall(logger, "skip_prompt", input, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // edit_prompt
  // -------------------------------------------------------------------------
  server.tool("edit_prompt", EditPromptInput.shape, async (input) => {
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

      // Re-assemble full prompt with new text
      const fullPrompt = templateEngine.assembleFullPrompt(
        input.new_prompt_text,
        "ecom",
        prompt.source,
      );

      await updateResearchPrompt(session, input.prompt_id, {
        prompt_text: input.new_prompt_text,
        full_prompt: fullPrompt,
      });

      const durationMs = performance.now() - start;
      logToolCall(logger, "edit_prompt", input, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: input.prompt_id,
                title: prompt.title,
                prompt_text: input.new_prompt_text,
                full_prompt_length: fullPrompt.length,
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
      logToolCall(logger, "edit_prompt", input, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });

  // -------------------------------------------------------------------------
  // research_queue_status
  // -------------------------------------------------------------------------
  server.tool("research_queue_status", {}, async () => {
    const start = performance.now();
    const session = driver.session();

    try {
      // Run sequentially — Neo4j sessions only support one transaction at a time
      const statusCounts = await countByStatus(session);
      const domainCounts = await countByDomainAndStatus(session);
      const nextResult = await getNextPrompt(session);

      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

      const durationMs = performance.now() - start;
      logToolCall(logger, "research_queue_status", {}, durationMs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total,
                byStatus: statusCounts,
                byDomain: domainCounts,
                nextUp: nextResult.prompt
                  ? {
                      id: nextResult.prompt.id,
                      title: nextResult.prompt.title,
                      domain_slug: nextResult.prompt.domain_slug,
                      priority: nextResult.prompt.priority,
                    }
                  : null,
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
      logToolCall(logger, "research_queue_status", {}, durationMs, errorMsg);

      return {
        content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
        isError: true,
      };
    } finally {
      await session.close();
    }
  });
};
