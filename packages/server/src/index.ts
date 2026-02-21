// =============================================================================
// @neo/server — Entry point
// =============================================================================
// Loads config, creates the Express + MCP server, and starts listening.
// Sets keepAliveTimeout and headersTimeout for Render.com compatibility.
// =============================================================================

import { createApp } from "./server.js";
import { seedDatabase } from "@neo/shared";
import { registerAdminTools } from "./tools/admin.js";
import { registerDomainTools } from "./tools/domains.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerRetrievalTools } from "./tools/retrieval.js";
import { registerSynthesisTools } from "./tools/synthesis.js";
import { registerResearchTools } from "./tools/research.js";
import { registerReviewTools } from "./tools/review.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { startScheduler, type SchedulerHandle } from "./scheduler.js";

const instance = createApp();
const { httpServer, deps, shutdown } = instance;

// Register MCP tools
instance.addToolRegistrar(registerAdminTools);
instance.addToolRegistrar(registerDomainTools);
instance.addToolRegistrar(registerKnowledgeTools);
instance.addToolRegistrar(registerRetrievalTools);
instance.addToolRegistrar(registerSynthesisTools);
instance.addToolRegistrar(registerResearchTools);
instance.addToolRegistrar(registerReviewTools);
instance.addToolRegistrar(registerPipelineTools);
const { config, logger } = deps;

// Auto-seed on startup (idempotent MERGE — safe to run every boot),
// then start the cron scheduler once seeding completes.
let scheduler: SchedulerHandle | undefined;

seedDatabase(deps.driver, logger)
  .then((result) => {
    logger.info("Database seed complete", {
      nodeTypes: result.nodeTypes,
      domains: result.domains,
      vectorIndexes: result.vectorIndexes,
    });
    scheduler = startScheduler(deps);
  })
  .catch((err) => {
    logger.error("Database seed failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Start scheduler even if seed fails — pipeline tools handle missing data gracefully
    scheduler = startScheduler(deps);
  });

httpServer.keepAliveTimeout = 120_000;
httpServer.headersTimeout = 120_000;

httpServer.listen(config.PORT, "0.0.0.0", () => {
  logger.info("Neo MCP server started", {
    port: config.PORT,
    host: "0.0.0.0",
    logLevel: config.LOG_LEVEL,
    corsOrigins: config.CORS_ORIGINS,
    rateLimitPerMin: config.RATE_LIMIT_PER_MIN,
  });
});

// Signal handlers registered here (not in createApp) to avoid accumulation
// if createApp is called multiple times (e.g., in integration tests).
function handleShutdown() {
  scheduler?.stop();
  shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Shutdown error", {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}

process.once("SIGTERM", handleShutdown);
process.once("SIGINT", handleShutdown);

// Re-export types for consumers
export type { ToolRegistrar, AppDependencies, AppInstance } from "./server.js";
export { createApp } from "./server.js";
