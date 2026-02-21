# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Web dashboard for managing the research pipeline (`GET /dashboard`)
  - API-key authentication (sessionStorage + Bearer token)
  - Stats bar with prompt counts by status
  - Tabbed prompt list filtered by status (needs_review, queued, ready, researched, etc.)
  - Prompt cards with copy-to-clipboard, research textarea, approve/reject actions
  - Pipeline actions: Approve All, Prepare Queue, Run Synthesis
- Dashboard REST API (9 endpoints under `/api`, auth required)

## [0.2.0] - 2026-02-19

### Added

- Synthesis pipeline: automated knowledge extraction from research text into Neo4j graph
- 4 new MCP tools (18 total):
  - `synthesize_research`: full pipeline (extract claims via Claude, embed, ingest nodes + relationships)
  - `synthesize_dry_run`: preview extraction without persisting to graph
  - `synthesize_batch`: process multiple research texts sequentially with aggregated results
  - `synthesize_review`: paginated synthesis run history with duplicate warnings
- Claude extraction engine with Structured Outputs (primary) and tool_choice fallback
- Two-layer Zod validation for extracted claims (strict + lenient with defaults)
- MERGE-based idempotent node ingestion with deterministic SHA-256 IDs
- Vector similarity duplicate detection (>0.88 cosine threshold, potential_duplicate flagging)
- Category-based UNWIND batch relationship creation (CAUSAL, EPISTEMIC, CONTEXTUAL, STRUCTURAL)
- SynthesisRun audit tracking with partial failure support
- Anthropic SDK client integration (@anthropic-ai/sdk)
- 6 synthesis integration tests (credential-gated)

## [0.1.0] - 2026-02-18

### Added

- TypeScript pnpm monorepo with @neo/shared, @neo/server, @neo/worker packages
- MCP server with Streamable HTTP transport (stateless mode)
- Neo4j AuraDB driver with connection pooling and health checks
- Idempotent schema seeder (MasterDomain, Domain, KnowledgeNode, relationships)
- Gemini embedding client (gemini-embedding-001, 768 dims) with retry/backoff
- RAG retrieval: vector search + 1-hop graph traversal with BFS ordering
- 14 MCP tools: admin (4), domain CRUD (5), knowledge CRUD (4), retrieval (1)
- Bearer auth middleware with per-client API key rotation
- Sliding window rate limiter (configurable per-minute limit)
- Structured JSON logger to stdout
- Zod-validated configuration with sensible defaults
- Render.com deployment blueprint (render.yaml)
- Integration test suite (19 tests, credential-gated)
- E-commerce seed data (16 domains)
