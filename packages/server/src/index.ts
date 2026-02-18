// =============================================================================
// @neo/server — Entry point
// =============================================================================
// Loads config, creates the Express + MCP server, and starts listening.
// Sets keepAliveTimeout and headersTimeout for Render.com compatibility.
// =============================================================================

import { createApp } from "./server.js";

const { httpServer, deps } = createApp();
const { config, logger } = deps;

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

// Re-export types for consumers
export type { ToolRegistrar, AppDependencies, AppInstance } from "./server.js";
export { createApp } from "./server.js";
