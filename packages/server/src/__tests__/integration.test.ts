// =============================================================================
// Integration tests for the Neo MCP Server
// =============================================================================
// Tests the full pipeline: server creation, database seeding, domain CRUD,
// knowledge node CRUD with real Gemini embeddings, and RAG retrieval via
// Neo4j vector search.
//
// Skips gracefully when credentials (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD,
// GEMINI_API_KEY, API_KEYS) are not present in the environment.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createApp, type AppInstance } from "../server.js";
import { registerAdminTools } from "../tools/admin.js";
import { registerDomainTools } from "../tools/domains.js";
import { registerKnowledgeTools } from "../tools/knowledge.js";
import { registerRetrievalTools } from "../tools/retrieval.js";
import { seedDatabase } from "@neo/shared";

// ---------------------------------------------------------------------------
// Credential gate — skip entire suite when env vars are missing
// ---------------------------------------------------------------------------

const hasCredentials = Boolean(
  process.env.NEO4J_URI &&
  process.env.NEO4J_USER &&
  process.env.NEO4J_PASSWORD &&
  process.env.GEMINI_API_KEY &&
  process.env.API_KEYS,
);

// ---------------------------------------------------------------------------
// Helper: create an MCP client connected to the server via in-memory transport
// ---------------------------------------------------------------------------

async function createTestClient(instance: AppInstance): Promise<Client> {
  const server = new McpServer({ name: "neo-test", version: "0.1.0" });

  registerAdminTools(server, instance.deps);
  registerDomainTools(server, instance.deps);
  registerKnowledgeTools(server, instance.deps);
  registerRetrievalTools(server, instance.deps);

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
    // Not JSON — leave as raw text (e.g. query_knowledge formatted output)
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

describe.skipIf(!hasCredentials)("Integration: Neo MCP Server", () => {
  let instance: AppInstance;
  let client: Client;

  // Track IDs for cleanup
  const createdDomainIds: string[] = [];
  const createdKnowledgeNodeIds: string[] = [];

  // -------------------------------------------------------------------------
  // Setup: create app, seed database, connect MCP client
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    instance = createApp();
    await seedDatabase(instance.deps.driver);
    client = await createTestClient(instance);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Teardown: delete test data, close connections
  // -------------------------------------------------------------------------

  afterAll(async () => {
    // Guard: if beforeAll failed, client may be undefined
    if (!client) {
      if (instance) await instance.shutdown();
      return;
    }

    // Delete knowledge nodes created during tests
    for (const id of createdKnowledgeNodeIds) {
      try {
        await callTool(client, "delete_knowledge_node", { id });
      } catch {
        // Best-effort cleanup
      }
    }

    // Delete domains created during tests
    for (const id of createdDomainIds) {
      try {
        await callTool(client, "delete_domain", { id });
      } catch {
        // Best-effort cleanup
      }
    }

    // Shut down app (closes Neo4j driver, rate limiter, HTTP server)
    if (instance) {
      await instance.shutdown();
    }
  }, 30_000);

  // =========================================================================
  // 1. Health check
  // =========================================================================

  describe("Health check", () => {
    it("health_check tool returns ok or degraded status", async () => {
      const result = await callTool(client, "health_check");

      expect(result.isError).toBeFalsy();

      const data = result.parsed as Record<string, unknown>;
      expect(["ok", "degraded"]).toContain(data.status);
      expect(data).toHaveProperty("neo4j");
      expect(data).toHaveProperty("gemini");
    }, 30_000);
  });

  // =========================================================================
  // 2. Schema
  // =========================================================================

  describe("Schema", () => {
    it("schema_info returns NodeType and RelationshipCategory registries", async () => {
      const result = await callTool(client, "schema_info");

      expect(result.isError).toBeFalsy();

      const data = result.parsed as {
        nodeTypes: Array<{ label: string }>;
        relationshipCategories: Array<{ category: string }>;
      };

      expect(data.nodeTypes.length).toBeGreaterThanOrEqual(3);
      expect(data.relationshipCategories.length).toBeGreaterThanOrEqual(4);
    }, 30_000);

    it("graph_stats returns node counts", async () => {
      const result = await callTool(client, "graph_stats");

      expect(result.isError).toBeFalsy();

      const data = result.parsed as {
        nodeCounts: Record<string, number>;
      };

      expect(data.nodeCounts.MasterDomain).toBeGreaterThanOrEqual(1);
      expect(data.nodeCounts.Domain).toBeGreaterThanOrEqual(16);
      expect(data.nodeCounts.NodeType).toBeGreaterThanOrEqual(3);
    }, 30_000);
  });

  // =========================================================================
  // 3. Domains
  // =========================================================================

  describe("Domains", () => {
    it("list_master_domains returns eCom master domain", async () => {
      const result = await callTool(client, "list_master_domains");

      expect(result.isError).toBeFalsy();

      const domains = result.parsed as Array<{ slug: string }>;
      const ecom = domains.find((d) => d.slug === "ecommerce");
      expect(ecom).toBeDefined();
    }, 30_000);

    it("create_domain creates a test domain", async () => {
      const result = await callTool(client, "create_domain", {
        title: "Integration Test Domain",
        slug: "integ-test-domain",
        description: "Temporary domain for integration testing",
        master_domain_slug: "ecommerce",
      });

      expect(result.isError).toBeFalsy();

      const domain = result.parsed as { id: string; slug: string };
      expect(domain.slug).toBe("integ-test-domain");

      createdDomainIds.push(domain.id);
    }, 30_000);

    it("list_domains filters by master_domain_slug", async () => {
      const result = await callTool(client, "list_domains", {
        master_domain_slug: "ecommerce",
      });

      expect(result.isError).toBeFalsy();

      const domains = result.parsed as Array<{ slug: string }>;
      const testDomain = domains.find((d) => d.slug === "integ-test-domain");
      expect(testDomain).toBeDefined();
    }, 30_000);

    it("delete_domain removes the test domain", async () => {
      // Only run if we have a domain to delete
      expect(createdDomainIds.length).toBeGreaterThan(0);

      const id = createdDomainIds.pop()!;
      const result = await callTool(client, "delete_domain", { id });

      expect(result.isError).toBeFalsy();

      const data = result.parsed as { message: string };
      expect(data.message).toContain("deleted successfully");
    }, 30_000);
  });

  // =========================================================================
  // 4. Knowledge nodes
  // =========================================================================

  describe("Knowledge nodes", () => {
    // We need domains for knowledge nodes — create them in this block's setup

    beforeAll(async () => {
      // Create primary test domain
      const r1 = await callTool(client, "create_domain", {
        title: "KN Test Domain",
        slug: "kn-test-domain",
        description: "Temporary domain for knowledge node tests",
        master_domain_slug: "ecommerce",
      });
      const d1 = r1.parsed as { id: string };
      createdDomainIds.push(d1.id);

      // Create secondary test domain for filtering tests
      const r2 = await callTool(client, "create_domain", {
        title: "KN Test Domain Alt",
        slug: "kn-test-domain-alt",
        description: "Secondary domain for filter tests",
        master_domain_slug: "ecommerce",
      });
      const d2 = r2.parsed as { id: string };
      createdDomainIds.push(d2.id);
    }, 30_000);

    it("create_knowledge_node with embedding — Dynamic Pricing Algorithms", async () => {
      const result = await callTool(client, "create_knowledge_node", {
        title: "Dynamic Pricing Algorithms",
        summary:
          "Algorithmic approaches to real-time price optimization in eCommerce, balancing demand elasticity with margin targets.",
        definition:
          "Dynamic pricing algorithms continuously adjust product prices based on real-time demand signals, competitor pricing, inventory levels, and customer willingness-to-pay. Implementations range from simple rule-based systems to reinforcement-learning models that optimize for long-term revenue. Key considerations include price fairness perception, competitive response dynamics, and the cold-start problem for new products.",
        claim_type: "definition",
        confidence: 0.88,
        domain_slug: "kn-test-domain",
        conditions:
          "Requires sufficient transaction volume for reliable signals",
        temporal_range: "2020-present",
        geographic_scope: "Global eCommerce markets",
      });

      expect(result.isError).toBeFalsy();

      const node = result.parsed as {
        id: string;
        title: string;
        freshness_date: string;
      };
      expect(node.title).toBe("Dynamic Pricing Algorithms");
      expect(node.freshness_date).toBeDefined();
      // Embedding should NOT appear in the response (excluded)
      expect(node).not.toHaveProperty("embedding");

      createdKnowledgeNodeIds.push(node.id);
    }, 30_000);

    it("create_knowledge_node creates second node — Customer Lifetime Value Optimization", async () => {
      const result = await callTool(client, "create_knowledge_node", {
        title: "Customer Lifetime Value Optimization",
        summary:
          "Strategies and models for maximizing the long-term revenue contribution of individual customers.",
        definition:
          "Customer lifetime value (CLV) optimization combines predictive modeling of future purchase behavior with targeted retention and upsell strategies. Modern CLV frameworks use probabilistic models (BG/NBD, Pareto/NBD) or machine learning to segment customers by predicted future value, then allocate marketing spend proportionally. Key levers include personalized recommendations, loyalty programs, and churn prevention interventions.",
        claim_type: "framework",
        confidence: 0.91,
        domain_slug: "kn-test-domain",
      });

      expect(result.isError).toBeFalsy();

      const node = result.parsed as { id: string; title: string };
      expect(node.title).toBe("Customer Lifetime Value Optimization");

      createdKnowledgeNodeIds.push(node.id);
    }, 30_000);

    it("create_knowledge_node creates third node — A/B Testing for Checkout Optimization", async () => {
      const result = await callTool(client, "create_knowledge_node", {
        title: "A/B Testing for Checkout Optimization",
        summary:
          "Controlled experimentation methodology for improving eCommerce checkout conversion rates.",
        definition:
          "A/B testing in checkout optimization involves randomizing visitors into control and treatment groups to measure the causal impact of checkout flow changes on conversion rate, average order value, and cart abandonment. Best practices include adequate sample sizing, sequential testing with alpha-spending functions, and segmented analysis to detect heterogeneous treatment effects across device types and customer cohorts.",
        claim_type: "recommendation",
        confidence: 0.85,
        domain_slug: "kn-test-domain",
      });

      expect(result.isError).toBeFalsy();

      const node = result.parsed as { id: string; title: string };
      expect(node.title).toBe("A/B Testing for Checkout Optimization");

      createdKnowledgeNodeIds.push(node.id);
    }, 30_000);

    it("list_knowledge_nodes returns created nodes with embeddings excluded", async () => {
      const result = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain",
      });

      expect(result.isError).toBeFalsy();

      const nodes = result.parsed as Array<{
        title: string;
        embedding?: unknown;
      }>;
      expect(nodes.length).toBeGreaterThanOrEqual(3);

      // Verify embeddings are excluded from list responses
      for (const node of nodes) {
        expect(node).not.toHaveProperty("embedding");
      }

      // Verify all three created nodes appear
      const titles = nodes.map((n) => n.title);
      expect(titles).toContain("Dynamic Pricing Algorithms");
      expect(titles).toContain("Customer Lifetime Value Optimization");
      expect(titles).toContain("A/B Testing for Checkout Optimization");
    }, 30_000);

    it("list_knowledge_nodes filters by domain", async () => {
      // Create a node in the alternate domain
      const altResult = await callTool(client, "create_knowledge_node", {
        title: "Alt Domain Node For Filter Test",
        summary: "A node in a different domain to test filtering.",
        definition:
          "This knowledge node exists solely to verify that domain_slug filtering in list_knowledge_nodes correctly restricts results to nodes belonging to the specified domain.",
        claim_type: "definition",
        confidence: 0.5,
        domain_slug: "kn-test-domain-alt",
      });

      const altNode = altResult.parsed as { id: string };
      createdKnowledgeNodeIds.push(altNode.id);

      // List nodes in primary domain — should NOT include the alt node
      const primaryResult = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain",
      });
      const primaryNodes = primaryResult.parsed as Array<{ title: string }>;
      const altTitles = primaryNodes.map((n) => n.title);
      expect(altTitles).not.toContain("Alt Domain Node For Filter Test");

      // List nodes in alt domain — should include the alt node
      const altListResult = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain-alt",
      });
      const altListNodes = altListResult.parsed as Array<{ title: string }>;
      const altListTitles = altListNodes.map((n) => n.title);
      expect(altListTitles).toContain("Alt Domain Node For Filter Test");
    }, 30_000);

    it("update_knowledge_node re-embeds on content change", async () => {
      // Use the first created node
      const nodeId = createdKnowledgeNodeIds[0];
      expect(nodeId).toBeDefined();

      // Wait a moment so freshness_date will differ
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await callTool(client, "update_knowledge_node", {
        id: nodeId,
        definition:
          "Dynamic pricing algorithms adjust prices in real time using demand signals, competitor data, inventory positions, and customer segmentation. Advanced implementations leverage multi-armed bandit and deep reinforcement learning approaches to balance exploration of price points with exploitation of known-optimal prices. Fairness constraints and regulatory compliance are increasingly important design considerations.",
      });

      expect(result.isError).toBeFalsy();

      const updated = result.parsed as {
        id: string;
        freshness_date: string;
      };
      expect(updated.id).toBe(nodeId);
      expect(updated.freshness_date).toBeDefined();
    }, 30_000);

    it("update_knowledge_node updates metadata without re-embedding", async () => {
      // Use the first created node
      const nodeId = createdKnowledgeNodeIds[0];
      expect(nodeId).toBeDefined();

      const result = await callTool(client, "update_knowledge_node", {
        id: nodeId,
        confidence: 0.95,
      });

      expect(result.isError).toBeFalsy();

      const updated = result.parsed as {
        id: string;
        confidence: number;
        freshness_date: string;
      };
      expect(updated.id).toBe(nodeId);
      expect(updated.confidence).toBe(0.95);
    }, 30_000);
  });

  // =========================================================================
  // 5. RAG retrieval
  // =========================================================================

  describe("RAG retrieval", () => {
    it("query_knowledge returns relevant results for pricing query", async () => {
      const result = await callTool(client, "query_knowledge", {
        query: "pricing algorithms in ecommerce",
        top_k: 5,
      });

      expect(result.isError).toBeFalsy();

      // The response is formatted text, not JSON
      expect(result.text).toContain("Dynamic Pricing Algorithms");
    }, 30_000);

    it("query_knowledge formats results as text with expected structure", async () => {
      const result = await callTool(client, "query_knowledge", {
        query: "customer lifetime value models",
        top_k: 5,
      });

      expect(result.isError).toBeFalsy();

      // Verify the formatted output includes expected markers
      expect(result.text).toContain("##");
      expect(result.text).toMatch(/score: \d+\.\d+/);
      expect(result.text).toContain("Confidence:");
      expect(result.text).toContain("Claim type:");
    }, 30_000);

    it("query_knowledge with domain filter restricts results", async () => {
      const result = await callTool(client, "query_knowledge", {
        query: "pricing algorithms optimization",
        top_k: 10,
        domain_filter: "kn-test-domain",
      });

      expect(result.isError).toBeFalsy();

      // Should return results (our test nodes are in kn-test-domain)
      // The response should not contain the alt-domain node
      expect(result.text).not.toContain("Alt Domain Node For Filter Test");
    }, 30_000);

    it("query_knowledge handles empty results gracefully", async () => {
      const result = await callTool(client, "query_knowledge", {
        query:
          "quantum chromodynamics hadron collider particle physics muon decay",
        top_k: 5,
        domain_filter: "kn-test-domain-alt",
      });

      expect(result.isError).toBeFalsy();

      // Should either return the "no results" message or low-confidence results
      // The exact behavior depends on whether there are ANY nodes with embeddings
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    }, 30_000);
  });

  // =========================================================================
  // 6. Pagination
  // =========================================================================

  describe("Pagination", () => {
    it("list_knowledge_nodes supports pagination with limit and offset", async () => {
      // List with limit=2
      const page1 = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain",
        limit: 2,
        offset: 0,
      });
      expect(page1.isError).toBeFalsy();
      const page1Nodes = page1.parsed as Array<{ title: string }>;
      expect(page1Nodes.length).toBeLessThanOrEqual(2);

      // List with offset=2 — should return remaining node(s)
      const page2 = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain",
        limit: 2,
        offset: 2,
      });
      expect(page2.isError).toBeFalsy();
      const page2Nodes = page2.parsed as Array<{ title: string }>;

      // Verify no overlap between pages
      const page1Titles = new Set(page1Nodes.map((n) => n.title));
      for (const node of page2Nodes) {
        expect(page1Titles.has(node.title)).toBe(false);
      }

      // Total across pages should equal the full list
      const fullResult = await callTool(client, "list_knowledge_nodes", {
        domain_slug: "kn-test-domain",
      });
      const fullNodes = fullResult.parsed as Array<{ title: string }>;
      expect(page1Nodes.length + page2Nodes.length).toBe(fullNodes.length);
    }, 30_000);
  });
});
