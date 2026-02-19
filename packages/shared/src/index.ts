// @neo/shared — shared types, utilities, and configuration
export * from "./types.js";
export * from "./schemas.js";
export * from "./config.js";
export * from "./neo4j/index.js";
export * from "./anthropic/index.js";
// Embeddings re-exported selectively to avoid HealthCheckResult name collision
export {
  type TaskType,
  type EmbeddingClient,
  type HealthCheckResult as EmbeddingHealthCheckResult,
  createEmbeddingClient,
  embedText,
  embedBatch,
  embedForStorage,
  embeddingHealthCheck,
} from "./embeddings/index.js";
