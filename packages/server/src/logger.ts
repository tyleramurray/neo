import { randomUUID } from "node:crypto";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createRequestId(): string {
  return randomUUID();
}

export function createLogger(options?: { level?: string }): Logger {
  const levelName = (options?.level ?? "info") as LogLevel;
  const threshold = LEVEL_VALUES[levelName] ?? LEVEL_VALUES.info;

  return buildLogger(threshold, {});
}

function buildLogger(
  threshold: number,
  bindings: Record<string, unknown>,
): Logger {
  function write(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (LEVEL_VALUES[level] < threshold) return;

    const entry = {
      level,
      msg,
      timestamp: new Date().toISOString(),
      ...bindings,
      ...data,
    };

    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    trace: (msg, data) => write("trace", msg, data),
    debug: (msg, data) => write("debug", msg, data),
    info: (msg, data) => write("info", msg, data),
    warn: (msg, data) => write("warn", msg, data),
    error: (msg, data) => write("error", msg, data),
    fatal: (msg, data) => write("fatal", msg, data),
    child: (childBindings) =>
      buildLogger(threshold, { ...bindings, ...childBindings }),
  };
}

export function logToolCall(
  logger: Logger,
  toolName: string,
  input: Record<string, unknown>,
  durationMs: number,
  error?: string,
): void {
  const data: Record<string, unknown> = { tool: toolName, input, durationMs };
  if (error !== undefined) {
    data.error = error;
    logger.error("Tool call failed", data);
  } else {
    logger.info("Tool called", data);
  }
}

export function logExternalCall(
  logger: Logger,
  service: "neo4j" | "gemini",
  operation: string,
  durationMs: number,
  error?: string,
): void {
  const data: Record<string, unknown> = { service, operation, durationMs };
  if (error !== undefined) {
    data.error = error;
    logger.error("External call failed", data);
  } else {
    logger.info("External call completed", data);
  }
}
