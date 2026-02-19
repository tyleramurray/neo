import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { Config } from "../config.js";

export type { Driver, Session };

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export function createDriver(config: Config): Driver {
  return neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
    {
      maxConnectionPoolSize: 30,
      connectionLivenessCheckTimeout: 300000,
    },
  );
}

export async function healthCheck(driver: Driver): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    await driver.getServerInfo();
    return { ok: true, latencyMs: performance.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closeDriver(driver: Driver): Promise<void> {
  await driver.close();
}

/** Converts a Neo4j Integer (or plain number) to a JS number. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}
