#!/usr/bin/env node
// =============================================================================
// @neo/shared — CLI seed script
// =============================================================================
// Standalone script to seed a Neo4j database with schema registry, eCom
// domains, synthesis prompt, and vector index.
//
// Usage:
//   NEO4J_URI=neo4j+s://... NEO4J_USER=neo4j NEO4J_PASSWORD=... npx tsx packages/shared/src/cli-seed.ts
//   # or after build:
//   pnpm seed
// =============================================================================

import neo4j from "neo4j-driver";
import { seedDatabase } from "./neo4j/seed.js";

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER ?? "neo4j";
const password = process.env.NEO4J_PASSWORD;

if (!uri || !password) {
  console.error(
    "Missing required env vars: NEO4J_URI and NEO4J_PASSWORD must be set.",
  );
  console.error(
    "Example: NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io NEO4J_PASSWORD=xxx pnpm seed",
  );
  process.exit(1);
}

console.log(`Connecting to ${uri} as ${user}...`);

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

try {
  // Verify connectivity first
  await driver.verifyConnectivity();
  console.log("Connected to Neo4j.\n");

  const result = await seedDatabase(driver, console);

  console.log("\nSeed summary:");
  console.log(`  NodeTypes:              ${result.nodeTypes}`);
  console.log(`  RelationshipCategories: ${result.relationshipCategories}`);
  console.log(`  MasterDomains:          ${result.masterDomains}`);
  console.log(`  Domains:                ${result.domains}`);
  console.log(`  SynthesisPrompts:       ${result.synthesisPrompts}`);
  console.log(`  VectorIndexes:          ${result.vectorIndexes}`);
} catch (err) {
  console.error(
    "Seed failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
} finally {
  await driver.close();
}
