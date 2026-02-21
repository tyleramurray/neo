// =============================================================================
// Unit tests for ResearchPrompt Neo4j operations
// =============================================================================
// Uses a mock Neo4j session to verify Cypher queries and parameters
// without needing a live database connection.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createResearchPrompt,
  updateResearchPrompt,
  getResearchPrompt,
  listResearchPrompts,
  getNextPrompt,
  countByStatus,
  countByDomainAndStatus,
  setPromptStatus,
} from "../research-prompts.js";

// ---------------------------------------------------------------------------
// Mock session factory
// ---------------------------------------------------------------------------

interface MockTx {
  run: ReturnType<typeof vi.fn>;
}

function createMockSession() {
  const mockTx: MockTx = { run: vi.fn() };

  const session = {
    executeWrite: vi.fn(async (fn: (tx: MockTx) => Promise<unknown>) => {
      return fn(mockTx);
    }),
    executeRead: vi.fn(async (fn: (tx: MockTx) => Promise<unknown>) => {
      return fn(mockTx);
    }),
    close: vi.fn(),
  };

  return {
    session: session as unknown as import("../driver.js").Session,
    mockTx,
  };
}

// ---------------------------------------------------------------------------
// Mock record helpers
// ---------------------------------------------------------------------------

function mockRecord(data: Record<string, unknown>) {
  return {
    get: (key: string) => data[key],
  };
}

function mockNode(props: Record<string, unknown>) {
  return { properties: props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("research-prompts operations", () => {
  let session: import("../driver.js").Session;
  let mockTx: MockTx;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockSession();
    session = mock.session;
    mockTx = mock.mockTx;
  });

  describe("createResearchPrompt", () => {
    it("should execute MERGE query with correct parameters", async () => {
      mockTx.run.mockResolvedValue({
        records: [mockRecord({ id: "test-uuid" })],
      });

      const id = await createResearchPrompt(session, {
        title: "Test Prompt",
        prompt_text: "Research about testing",
        status: "queued",
        priority: 7,
        source: "manual",
        domain_slug: "sponsored-search-onsite",
        master_domain: "ecommerce",
      });

      expect(id).toBeDefined();
      expect(mockTx.run).toHaveBeenCalledTimes(1);

      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("MERGE (rp:ResearchPrompt");
      expect(query).toContain("TARGETS");
      expect(params.title).toBe("Test Prompt");
      expect(params.prompt_text).toBe("Research about testing");
      expect(params.status).toBe("queued");
      expect(params.priority).toBe(7);
      expect(params.source).toBe("manual");
      expect(params.domain_slug).toBe("sponsored-search-onsite");
      expect(params.master_domain).toBe("ecommerce");
    });
  });

  describe("updateResearchPrompt", () => {
    it("should build SET clauses for provided fields", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await updateResearchPrompt(session, "prompt-123", {
        title: "Updated Title",
        priority: 8,
      });

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("rp.title = $title");
      expect(query).toContain("rp.priority = $priority");
      expect(params.id).toBe("prompt-123");
      expect(params.title).toBe("Updated Title");
      expect(params.priority).toBe(8);
    });

    it("should skip when no updates provided", async () => {
      await updateResearchPrompt(session, "prompt-123", {});
      expect(mockTx.run).not.toHaveBeenCalled();
    });
  });

  describe("getResearchPrompt", () => {
    it("should return prompt when found", async () => {
      mockTx.run.mockResolvedValue({
        records: [
          mockRecord({
            rp: mockNode({
              id: "prompt-123",
              title: "Test",
              prompt_text: "Query",
              status: "queued",
              priority: 5,
              source: "manual",
              domain_slug: "content-pdps",
              master_domain: "ecommerce",
            }),
          }),
        ],
      });

      const result = await getResearchPrompt(session, "prompt-123");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("prompt-123");
      expect(result!.title).toBe("Test");
      expect(result!.status).toBe("queued");
    });

    it("should return null when not found", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      const result = await getResearchPrompt(session, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listResearchPrompts", () => {
    it("should filter by status and domain", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await listResearchPrompts(session, {
        status: "ready_for_research",
        domain_slug: "content-pdps",
        limit: 10,
      });

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("rp.status = $status");
      expect(query).toContain("rp.domain_slug = $domain_slug");
      expect(query).toContain("ORDER BY rp.priority DESC");
      expect(params.status).toBe("ready_for_research");
      expect(params.domain_slug).toBe("content-pdps");
      expect(params.limit.toNumber()).toBe(10);
    });

    it("should use defaults when no options provided", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await listResearchPrompts(session);

      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).not.toContain("WHERE");
      expect(params.limit.toNumber()).toBe(20);
      expect(params.offset.toNumber()).toBe(0);
    });
  });

  describe("getNextPrompt", () => {
    it("should return highest-priority ready prompt", async () => {
      mockTx.run.mockResolvedValue({
        records: [
          mockRecord({
            total: 3,
            next: mockNode({
              id: "top-prompt",
              title: "High Priority",
              prompt_text: "Research this",
              status: "ready_for_research",
              priority: 9,
              source: "gap_detection",
              domain_slug: "retail-media-measurement",
              master_domain: "ecommerce",
            }),
          }),
        ],
      });

      const { prompt, remainingCount } = await getNextPrompt(session);
      expect(prompt).not.toBeNull();
      expect(prompt!.id).toBe("top-prompt");
      expect(prompt!.priority).toBe(9);
      expect(remainingCount).toBe(2); // total - 1
    });

    it("should return null when no prompts ready", async () => {
      mockTx.run.mockResolvedValue({
        records: [mockRecord({ total: 0, next: null })],
      });

      const { prompt, remainingCount } = await getNextPrompt(session);
      expect(prompt).toBeNull();
      expect(remainingCount).toBe(0);
    });
  });

  describe("countByStatus", () => {
    it("should aggregate counts per status", async () => {
      mockTx.run.mockResolvedValue({
        records: [
          mockRecord({ status: "queued", count: 5 }),
          mockRecord({ status: "researched", count: 3 }),
          mockRecord({ status: "completed", count: 12 }),
        ],
      });

      const counts = await countByStatus(session);
      expect(counts).toEqual({
        queued: 5,
        researched: 3,
        completed: 12,
      });
    });
  });

  describe("countByDomainAndStatus", () => {
    it("should aggregate per domain per status", async () => {
      mockTx.run.mockResolvedValue({
        records: [
          mockRecord({
            domain_slug: "content-pdps",
            status: "queued",
            count: 2,
          }),
          mockRecord({
            domain_slug: "retail-media-measurement",
            status: "completed",
            count: 5,
          }),
        ],
      });

      const result = await countByDomainAndStatus(session);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        domain_slug: "content-pdps",
        status: "queued",
        count: 2,
      });
    });
  });

  describe("setPromptStatus", () => {
    it("should set researched_date when transitioning to researched", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await setPromptStatus(session, "prompt-123", "researched", {
        research_output: "Research text...",
        research_word_count: 500,
      });

      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("rp.status = $status");
      expect(query).toContain("rp.researched_date");
      expect(query).toContain("rp.research_output");
      expect(query).toContain("rp.research_word_count");
      expect(params.status).toBe("researched");
      expect(params.research_output).toBe("Research text...");
      expect(params.research_word_count).toBe(500);
    });

    it("should set completed_date when transitioning to completed", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await setPromptStatus(session, "prompt-123", "completed");

      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("rp.completed_date");
      expect(params.status).toBe("completed");
      expect(params.completed_date).toBeDefined();
    });

    it("should set error_message when transitioning to failed", async () => {
      mockTx.run.mockResolvedValue({ records: [] });

      await setPromptStatus(session, "prompt-123", "failed", {
        error_message: "API timeout",
      });

      const [query, params] = mockTx.run.mock.calls[0];
      expect(query).toContain("rp.error_message");
      expect(params.error_message).toBe("API timeout");
    });
  });
});
