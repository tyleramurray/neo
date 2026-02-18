// =============================================================================
// @neo/shared — Environment variable config with validation
// =============================================================================
// Loads configuration from environment variables with sensible defaults.
// Required variables throw on missing. Optional variables fall back to
// documented defaults. API_KEYS is validated as JSON.
// =============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * JSON string that parses to a map of API key -> client ID.
 * Example: '{"sk-abc123": "mcp-server", "sk-def456": "worker"}'
 */
const apiKeysSchema = z.string().transform((val, ctx) => {
  try {
    const parsed: unknown = JSON.parse(val);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "API_KEYS must be a JSON object mapping key strings to client ID strings",
      });
      return z.NEVER;
    }
    const record = parsed as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `API_KEYS value for "${key}" must be a string, got ${typeof value}`,
        });
        return z.NEVER;
      }
    }
    return record as Record<string, string>;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "API_KEYS must be valid JSON",
    });
    return z.NEVER;
  }
});

const configSchema = z.object({
  // Required
  NEO4J_URI: z.string().min(1, "NEO4J_URI is required"),
  NEO4J_USER: z.string().min(1, "NEO4J_USER is required"),
  NEO4J_PASSWORD: z.string().min(1, "NEO4J_PASSWORD is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  API_KEYS: apiKeysSchema,

  // Optional with defaults
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).default(768),
  EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  CORS_ORIGINS: z.string().default("*"),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(100),
});

// ---------------------------------------------------------------------------
// Exported type
// ---------------------------------------------------------------------------

export type Config = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate configuration from environment variables.
 *
 * Throws a ZodError with detailed messages if any required variable is
 * missing or any value fails validation.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return configSchema.parse(env);
}
