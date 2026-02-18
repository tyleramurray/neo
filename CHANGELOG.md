# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
