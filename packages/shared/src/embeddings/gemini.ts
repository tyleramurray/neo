import { GoogleGenAI } from "@google/genai";

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface EmbeddingClient {
  ai: GoogleGenAI;
  model: string;
  dimensions: number;
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const BACKOFF_FACTOR = 2;

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("429") || msg.includes("rate limit")) return true;
    if (/5\d{2}/.test(msg)) return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as Record<string, unknown>).status === "number"
  ) {
    const status = (error as Record<string, number>).status;
    if (status === 429 || (status >= 500 && status < 600)) return true;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isRetryable(error)) throw error;
      const delay = INITIAL_DELAY_MS * BACKOFF_FACTOR ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function createEmbeddingClient(
  apiKey: string,
  options?: { model?: string; dimensions?: number },
): EmbeddingClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    ai,
    model: options?.model ?? "gemini-embedding-001",
    dimensions: options?.dimensions ?? 768,
  };
}

export async function embedText(
  client: EmbeddingClient,
  text: string,
  taskType: TaskType,
): Promise<number[]> {
  const response = await withRetry(() =>
    client.ai.models.embedContent({
      model: client.model,
      contents: text,
      config: {
        outputDimensionality: client.dimensions,
        taskType,
      },
    }),
  );

  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("Embedding response missing values");
  }
  return values;
}

export async function embedBatch(
  client: EmbeddingClient,
  texts: string[],
  taskType: TaskType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await withRetry(() =>
    client.ai.models.embedContent({
      model: client.model,
      contents: texts,
      config: {
        outputDimensionality: client.dimensions,
        taskType,
      },
    }),
  );

  const embeddings = response.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, got ${embeddings?.length ?? 0}`,
    );
  }

  return embeddings.map((e, i) => {
    if (!e.values) {
      throw new Error(`Embedding at index ${i} missing values`);
    }
    return e.values;
  });
}

export async function embedForStorage(
  client: EmbeddingClient,
  definition: string,
  summary: string,
): Promise<number[]> {
  return embedText(client, definition + " " + summary, "RETRIEVAL_DOCUMENT");
}

export async function embeddingHealthCheck(
  client: EmbeddingClient,
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await embedText(client, "health check", "RETRIEVAL_QUERY");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
