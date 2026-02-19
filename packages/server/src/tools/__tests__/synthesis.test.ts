// =============================================================================
// Integration tests for synthesis MCP tools
// =============================================================================
// Tests the synthesis pipeline: dry_run extraction, full research ingestion,
// duplicate MERGE behavior, batch processing, and review log listing.
//
// Skips gracefully when credentials (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD,
// GEMINI_API_KEY, ANTHROPIC_API_KEY, API_KEYS) are not present in the
// environment.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createApp, type AppInstance } from "../../server.js";
import { registerDomainTools } from "../domains.js";
import { registerSynthesisTools } from "../synthesis.js";
import { seedDatabase } from "@neo/shared";

// ---------------------------------------------------------------------------
// Credential gate — skip entire suite when env vars are missing
// ---------------------------------------------------------------------------

const hasCredentials = Boolean(
  process.env.NEO4J_URI &&
  process.env.NEO4J_USER &&
  process.env.NEO4J_PASSWORD &&
  process.env.GEMINI_API_KEY &&
  process.env.ANTHROPIC_API_KEY &&
  process.env.API_KEYS,
);

// ---------------------------------------------------------------------------
// Sample research text for synthesis tests
// ---------------------------------------------------------------------------

const SAMPLE_RESEARCH_TEXT =
  "The global e-commerce market grew 15% in 2024, reaching $6.3 trillion. " +
  "Mobile commerce accounted for 60% of transactions. Buy-now-pay-later " +
  "(BNPL) services saw 45% adoption among Gen Z shoppers.";

const SAMPLE_RESEARCH_TEXT_2 =
  "Cross-border e-commerce expanded 22% year-over-year in 2024. " +
  "Southeast Asian markets led growth with 35% increase in online retail. " +
  "Social commerce through TikTok Shop and Instagram generated $120 billion globally.";

// ---------------------------------------------------------------------------
// Helper: create an MCP client connected to the server via in-memory transport
// ---------------------------------------------------------------------------

async function createTestClient(instance: AppInstance): Promise<Client> {
  const server = new McpServer({ name: "neo-synth-test", version: "0.1.0" });

  registerDomainTools(server, instance.deps);
  registerSynthesisTools(server, instance.deps);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(clientTransport);

  return client;
}

// ---------------------------------------------------------------------------
// Helper: call an MCP tool and parse the text response as JSON
// ---------------------------------------------------------------------------

interface ToolResult {
  text: string;
  isError?: boolean;
  parsed: unknown;
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args });

  const content = result.content as Array<{ type: string; text?: string }>;
  const textContent = content.find((c) => c.type === "text");
  const text = textContent?.text ?? "";

  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — leave as raw text
  }

  return {
    text,
    isError: result.isError as boolean | undefined,
    parsed,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe.skipIf(!hasCredentials)("synthesis tools", () => {
  let instance: AppInstance;
  let client: Client;

  // Track domain IDs for cleanup
  const createdDomainIds: string[] = [];

  // Track the domain slug used across tests
  const TEST_DOMAIN_SLUG = "synth-test-domain";

  // -------------------------------------------------------------------------
  // Setup: create app, seed database, connect MCP client, create test domain
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    instance = createApp();
    await seedDatabase(instance.deps.driver);
    client = await createTestClient(instance);

    // Create a test domain for synthesis operations
    const result = await callTool(client, "create_domain", {
      title: "Synthesis Test Domain",
      slug: TEST_DOMAIN_SLUG,
      description: "Temporary domain for synthesis integration tests",
      master_domain_slug: "ecommerce",
    });

    const domain = result.parsed as { id: string };
    createdDomainIds.push(domain.id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Teardown: delete test domain, close connections
  // -------------------------------------------------------------------------

  afterAll(async () => {
    if (!client) {
      if (instance) await instance.shutdown();
      return;
    }

    // Clean up test domain (DETACH DELETE removes domain + edges; KnowledgeNodes
    // and SynthesisRun records created during tests are left as orphans)
    for (const id of createdDomainIds) {
      try {
        await callTool(client, "delete_domain", { id });
      } catch {
        // Best-effort cleanup
      }
    }

    if (instance) {
      await instance.shutdown();
    }
  }, 30_000);

  // =========================================================================
  // 1. synthesize_dry_run
  // =========================================================================

  it("synthesize_dry_run extracts claims from sample text", async () => {
    const result = await callTool(client, "synthesize_dry_run", {
      text: SAMPLE_RESEARCH_TEXT,
      domain_slug: TEST_DOMAIN_SLUG,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      dryRun: boolean;
      domainSlug: string;
      claimsExtracted: number;
      claims: Array<{
        title: string;
        definition: string;
        summary: string;
        claimType: string;
        confidence: number;
        evidence: unknown[];
        relationships: unknown[];
      }>;
    };

    expect(data.dryRun).toBe(true);
    expect(data.domainSlug).toBe(TEST_DOMAIN_SLUG);
    expect(Array.isArray(data.claims)).toBe(true);
    expect(data.claims.length).toBeGreaterThan(0);
    expect(data.claimsExtracted).toBe(data.claims.length);

    // Verify each claim has the expected structure
    for (const claim of data.claims) {
      expect(claim).toHaveProperty("title");
      expect(claim).toHaveProperty("definition");
      expect(claim).toHaveProperty("summary");
      expect(claim).toHaveProperty("claimType");
      expect(claim).toHaveProperty("confidence");
      expect(claim).toHaveProperty("evidence");
      expect(claim).toHaveProperty("relationships");
      expect(typeof claim.title).toBe("string");
      expect(typeof claim.definition).toBe("string");
      expect(typeof claim.summary).toBe("string");
      expect(typeof claim.claimType).toBe("string");
      expect(typeof claim.confidence).toBe("number");
      expect(Array.isArray(claim.evidence)).toBe(true);
      expect(Array.isArray(claim.relationships)).toBe(true);
    }
  }, 30_000);

  // =========================================================================
  // 2. synthesize_research — full pipeline
  // =========================================================================

  it("synthesize_research creates nodes and SynthesisRun", async () => {
    const result = await callTool(client, "synthesize_research", {
      text: SAMPLE_RESEARCH_TEXT,
      domain_slug: TEST_DOMAIN_SLUG,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      runId: string;
      domainSlug: string;
      claims: unknown[];
      nodesCreated: number;
      relationshipsCreated: number;
      duplicatesFound: number;
      warnings: string[];
    };

    expect(typeof data.runId).toBe("string");
    expect(data.runId.length).toBeGreaterThan(0);
    expect(data.domainSlug).toBe(TEST_DOMAIN_SLUG);
    expect(data.nodesCreated).toBeGreaterThan(0);
    expect(Array.isArray(data.claims)).toBe(true);
    expect(data.claims.length).toBeGreaterThan(0);
  }, 60_000);

  // =========================================================================
  // 3. synthesize_research duplicate — MERGE behavior
  // =========================================================================

  it("synthesize_research with same input does MERGE (no duplicates)", async () => {
    // Run synthesis again with the SAME text — should MERGE existing nodes
    const result = await callTool(client, "synthesize_research", {
      text: SAMPLE_RESEARCH_TEXT,
      domain_slug: TEST_DOMAIN_SLUG,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      runId: string;
      nodesCreated: number;
      duplicatesFound: number;
      warnings: string[];
    };

    // On re-run with same input, nodes should be merged rather than duplicated.
    // Either nodesCreated is 0 (pure MERGE) or duplicatesFound > 0 (detected dups).
    expect(typeof data.runId).toBe("string");
    expect(data.nodesCreated === 0 || data.duplicatesFound > 0).toBe(true);
  }, 60_000);

  // =========================================================================
  // 4. synthesize_batch — multiple items
  // =========================================================================

  it("synthesize_batch processes multiple items", async () => {
    const result = await callTool(client, "synthesize_batch", {
      items: [
        { text: SAMPLE_RESEARCH_TEXT, source: "test-source-1" },
        { text: SAMPLE_RESEARCH_TEXT_2, source: "test-source-2" },
      ],
      domain_slug: TEST_DOMAIN_SLUG,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      totalItems: number;
      succeeded: number;
      failed: number;
      totalNodesCreated: number;
      totalRelationshipsCreated: number;
      totalDuplicatesFound: number;
      runIds: string[];
      errors: unknown[];
      warnings: string[];
    };

    expect(data.totalItems).toBe(2);
    expect(data.succeeded).toBeGreaterThanOrEqual(1);
    expect(data.runIds.length).toBe(2);
    expect(Array.isArray(data.runIds)).toBe(true);
    for (const runId of data.runIds) {
      expect(typeof runId).toBe("string");
      expect(runId.length).toBeGreaterThan(0);
    }
  }, 120_000);

  // =========================================================================
  // 5. Vector dedup flag — potential_duplicate detection
  // =========================================================================

  it("flags potential_duplicate for highly similar nodes", async () => {
    // Tests 2 & 3 already ran synthesis with the same text twice against the
    // same domain, so vector similarity should have flagged duplicates.
    // Use synthesize_review with include_warnings to check.
    const result = await callTool(client, "synthesize_review", {
      domain_slug: TEST_DOMAIN_SLUG,
      include_warnings: true,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      runs: Array<{
        runId: string;
        duplicateWarnings: number;
        potentialDuplicates?: Array<{ title: string; nodeId: string }>;
      }>;
    };

    // At least one run should have flagged duplicates (from re-running same text)
    const anyDuplicates = data.runs.some(
      (run) =>
        run.duplicateWarnings > 0 ||
        (run.potentialDuplicates && run.potentialDuplicates.length > 0),
    );
    expect(anyDuplicates).toBe(true);

    // Verify potentialDuplicates structure when present
    for (const run of data.runs) {
      if (run.potentialDuplicates && run.potentialDuplicates.length > 0) {
        for (const dup of run.potentialDuplicates) {
          expect(typeof dup.title).toBe("string");
          expect(typeof dup.nodeId).toBe("string");
        }
      }
    }
  }, 30_000);

  // =========================================================================
  // 6. synthesize_review — run history
  // =========================================================================

  it("synthesize_review returns run history", async () => {
    const result = await callTool(client, "synthesize_review", {
      domain_slug: TEST_DOMAIN_SLUG,
    });

    expect(result.isError).toBeFalsy();

    const data = result.parsed as {
      runs: Array<{
        runId: string;
        domain: string;
        status: string;
        timestamp: string;
        completedAt: string | null;
        nodesCreated: number;
        relationshipsCreated: number;
        duplicateWarnings: number;
      }>;
      count: number;
      limit: number;
      offset: number;
    };

    expect(Array.isArray(data.runs)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(1);

    // Verify each run has expected structure
    for (const run of data.runs) {
      expect(typeof run.runId).toBe("string");
      expect(typeof run.domain).toBe("string");
      expect(typeof run.status).toBe("string");
      expect(typeof run.timestamp).toBe("string");
      expect(["completed", "failed", "partial"]).toContain(run.status);
    }

    // Verify pagination metadata
    expect(typeof data.limit).toBe("number");
    expect(typeof data.offset).toBe("number");
  }, 30_000);
});
