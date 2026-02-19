export { createDriver, healthCheck, closeDriver, toNumber } from "./driver.js";

export type { Driver, Session, HealthCheckResult } from "./driver.js";

export { seedDatabase } from "./seed.js";
export type { SeedResult, SeedLogger } from "./seed.js";

export { queryKnowledgeGraph } from "./retrieval.js";
export type {
  RetrievalResult,
  RetrievedNode,
  RelatedNode,
  RetrievalOptions,
} from "./retrieval.js";

export {
  createSynthesisRun,
  updateSynthesisRun,
  getSynthesisRun,
  listSynthesisRuns,
} from "./synthesis-runs.js";

export { ingestNodes, ingestRelationships } from "./synthesis-ingest.js";
