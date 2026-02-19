// =============================================================================
// @neo/server — MCP server factory + Express app + Streamable HTTP transport
// =============================================================================
// Creates an Express application with health checks, authentication, rate
// limiting, and a stateless MCP Streamable HTTP endpoint. The factory
// function returns everything Batch 4 tool modules need to register tools.
// =============================================================================

import { createServer, type Server as HttpServer } from "node:http";
import express, {
  type Express,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type Anthropic from "@anthropic-ai/sdk";
import {
  type Config,
  loadConfig,
  createDriver,
  healthCheck,
  closeDriver,
  type Driver,
  createEmbeddingClient,
  embeddingHealthCheck,
  type EmbeddingClient,
  createAnthropicClient,
} from "@neo/shared";
import { createLogger, type Logger } from "./logger.js";
import { createAuthMiddleware, createRateLimiter } from "./auth.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Callback that registers MCP tools on a per-request McpServer instance.
 * Batch 4 tool modules export functions matching this signature.
 */
export type ToolRegistrar = (server: McpServer, deps: AppDependencies) => void;

/**
 * Shared dependencies that tool implementations need.
 */
export interface AppDependencies {
  driver: Driver;
  embeddingClient: EmbeddingClient;
  anthropicClient: Anthropic;
  logger: Logger;
  config: Config;
}

/**
 * Return value of createApp — gives callers access to the HTTP server,
 * Express app, dependencies, and a shutdown function.
 */
export interface AppInstance {
  app: Express;
  httpServer: HttpServer;
  deps: AppDependencies;
  /** Register a tool registrar that will be called for every MCP request. */
  addToolRegistrar: (registrar: ToolRegistrar) => void;
  /** Graceful shutdown: close Neo4j, rate limiter, and HTTP server. */
  shutdown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// CORS middleware (inline — no external dependency)
// ---------------------------------------------------------------------------

function createCorsMiddleware(origins: string): RequestHandler {
  return (req: Request, res: Response, next) => {
    res.setHeader("Access-Control-Allow-Origin", origins);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApp(
  env?: Record<string, string | undefined>,
): AppInstance {
  // --- Configuration & dependencies ---
  const config = loadConfig(env);
  const driver = createDriver(config);
  const embeddingClient = createEmbeddingClient(config.GEMINI_API_KEY, {
    dimensions: config.EMBEDDING_DIMENSIONS,
    model: config.EMBEDDING_MODEL,
  });
  const anthropicClient = createAnthropicClient(config.ANTHROPIC_API_KEY);
  const logger = createLogger({ level: config.LOG_LEVEL });

  const deps: AppDependencies = {
    driver,
    embeddingClient,
    anthropicClient,
    logger,
    config,
  };

  // Tool registrars added by Batch 4 modules
  const toolRegistrars: ToolRegistrar[] = [];

  // --- Express app ---
  const app = express();
  app.use(express.json());
  app.use(createCorsMiddleware(config.CORS_ORIGINS));

  // --- Health endpoint (unauthenticated) ---
  app.get("/health", async (_req: Request, res: Response) => {
    try {
      const [neo4jResult, geminiResult] = await Promise.all([
        healthCheck(driver),
        embeddingHealthCheck(embeddingClient),
      ]);

      const allOk = neo4jResult.ok && geminiResult.ok;
      const anyOk = neo4jResult.ok || geminiResult.ok;
      const status = allOk ? "ok" : anyOk ? "degraded" : "unhealthy";

      res.status(anyOk ? 200 : 503).json({
        status,
        neo4j: neo4jResult,
        gemini: geminiResult,
        uptime: process.uptime(),
      });
    } catch (err) {
      logger.error("Health check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(503).json({
        status: "unhealthy",
        neo4j: { ok: false, latencyMs: 0, error: "check failed" },
        gemini: { ok: false, latencyMs: 0, error: "check failed" },
        uptime: process.uptime(),
      });
    }
  });

  // --- Auth + Rate limiter for MCP routes ---
  const authMiddleware = createAuthMiddleware(config.API_KEYS);
  const rateLimiter = createRateLimiter(config.RATE_LIMIT_PER_MIN);

  // --- MCP Streamable HTTP transport (stateless, per-request) ---
  app.post(
    "/mcp",
    authMiddleware,
    rateLimiter,
    async (req: Request, res: Response) => {
      try {
        const server = new McpServer({ name: "neo", version: "0.1.0" });

        // Register the placeholder ping tool
        server.tool("ping", {}, async () => ({
          content: [{ type: "text" as const, text: "pong" }],
        }));

        // Register any tools added by Batch 4 modules
        for (const registrar of toolRegistrars) {
          registrar(server, deps);
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logger.error("MCP request failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    },
  );

  // Reject GET and DELETE for stateless server
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Method not allowed for stateless server" });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Method not allowed for stateless server" });
  });

  // --- HTTP server ---
  const httpServer = createServer(app);

  // --- Graceful shutdown ---
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Shutting down gracefully...");

    // Close rate limiter cleanup interval
    rateLimiter.shutdown();

    // Close HTTP server (stop accepting new connections)
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Close Neo4j driver
    await closeDriver(driver);

    logger.info("Shutdown complete");
  }

  return {
    app,
    httpServer,
    deps,
    addToolRegistrar: (registrar: ToolRegistrar) => {
      toolRegistrars.push(registrar);
    },
    shutdown,
  };
}
