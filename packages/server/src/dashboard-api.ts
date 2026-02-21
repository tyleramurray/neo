// =============================================================================
// @neo/server — Dashboard REST API routes
// =============================================================================
// Express Router exposing research-prompt CRUD and pipeline actions as simple
// REST endpoints. All routes require Bearer token auth (same keys as MCP).
// The dashboard HTML page calls these via fetch().
// =============================================================================

import { Router, type Request, type Response } from "express";
import {
  type ResearchPromptStatus,
  listResearchPrompts,
  getResearchPrompt,
  setPromptStatus,
  countByStatus,
} from "@neo/shared";
import type { AppDependencies } from "./server.js";
import { prepareResearchQueue, runSynthesisBatch } from "./tools/pipeline.js";

/**
 * Run `fn` inside a Neo4j session with automatic close and error handling.
 * The callback sends its own response. Uncaught errors become 500 JSON.
 */
async function withSession(
  deps: AppDependencies,
  res: Response,
  fn: (session: import("neo4j-driver").Session) => Promise<void>,
): Promise<void> {
  const session = deps.driver.session();
  try {
    await fn(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    await session.close();
  }
}

export function createDashboardRouter(deps: AppDependencies): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /api/stats — prompt counts by status
  // -------------------------------------------------------------------------
  router.get("/stats", async (_req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      res.json(await countByStatus(session));
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/prompts?status=X — list prompts with optional status filter
  // -------------------------------------------------------------------------
  router.get("/prompts", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      const status = req.query.status as ResearchPromptStatus | undefined;
      res.json(await listResearchPrompts(session, { status, limit: 100 }));
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/prompts/:id — single prompt detail
  // -------------------------------------------------------------------------
  router.get("/prompts/:id", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      const prompt = await getResearchPrompt(session, req.params.id as string);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }
      res.json(prompt);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/:id/research — save research output
  // -------------------------------------------------------------------------
  router.post("/prompts/:id/research", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      const { research_output } = req.body as { research_output?: string };
      if (!research_output || research_output.trim().length === 0) {
        res.status(400).json({ error: "research_output is required" });
        return;
      }
      const wordCount = research_output.trim().split(/\s+/).length;
      await setPromptStatus(session, req.params.id as string, "researched", {
        research_output,
        research_word_count: wordCount,
      });
      res.json({ ok: true, research_word_count: wordCount });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/:id/approve — move a single prompt to queued
  // -------------------------------------------------------------------------
  router.post("/prompts/:id/approve", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      await setPromptStatus(session, req.params.id as string, "queued");
      res.json({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/approve-all — approve all needs_review → queued
  // -------------------------------------------------------------------------
  router.post("/prompts/approve-all", async (_req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      const prompts = await listResearchPrompts(session, {
        status: "needs_review",
        limit: 100,
      });
      for (const p of prompts) {
        await setPromptStatus(session, p.id, "queued");
      }
      res.json({ ok: true, approved: prompts.length });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/:id/reject — reject a prompt
  // -------------------------------------------------------------------------
  router.post("/prompts/:id/reject", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      await setPromptStatus(session, req.params.id as string, "rejected");
      res.json({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/:id/retry — reset a failed prompt back to researched
  // -------------------------------------------------------------------------
  router.post("/prompts/:id/retry", async (req: Request, res: Response) => {
    await withSession(deps, res, async (session) => {
      await setPromptStatus(session, req.params.id as string, "researched", {
        error_message: "",
      });
      res.json({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/prompts/retry-all-failed — reset all failed → researched
  // -------------------------------------------------------------------------
  router.post(
    "/prompts/retry-all-failed",
    async (_req: Request, res: Response) => {
      await withSession(deps, res, async (session) => {
        const prompts = await listResearchPrompts(session, {
          status: "failed",
          limit: 100,
        });
        for (const p of prompts) {
          await setPromptStatus(session, p.id, "researched", {
            error_message: "",
          });
        }
        res.json({ ok: true, retried: prompts.length });
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/pipeline/prepare — prepare research queue
  // -------------------------------------------------------------------------
  router.post("/pipeline/prepare", async (_req: Request, res: Response) => {
    try {
      const result = await prepareResearchQueue(deps);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/pipeline/synthesize — run synthesis batch
  // -------------------------------------------------------------------------
  router.post("/pipeline/synthesize", async (_req: Request, res: Response) => {
    try {
      const result = await runSynthesisBatch(deps);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
