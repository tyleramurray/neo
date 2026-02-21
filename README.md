# Neo

Multi-Domain Knowledge Graph MCP Server. A TypeScript service that exposes a Neo4j-backed knowledge graph through the Model Context Protocol (MCP), enabling AI assistants to store, retrieve, and query structured knowledge via vector search and graph traversal.

Built as a pnpm monorepo with three packages:

- **@neo/shared** -- Types, schemas, Neo4j driver, Gemini embedding client, retrieval logic
- **@neo/server** -- MCP server with Streamable HTTP transport, auth, rate limiting, 18 tools
- **@neo/worker** -- Background processing pipeline (Phase 2, placeholder)

## Architecture

```
MCP Client (Claude, etc.)           Browser
    |                                  |
    | Streamable HTTP (POST /mcp)      | GET /dashboard + REST /api/*
    | Bearer auth + rate limiting      | Bearer auth (API key)
    v                                  v
@neo/server (Express + MCP SDK)
    |
    |-- Admin tools (ping, health_check, schema_info, graph_stats)
    |-- Domain tools (list/create master domains, list/create/delete domains)
    |-- Knowledge tools (list/create/update/delete nodes)
    |-- Retrieval (query_knowledge: embed -> vector search -> graph traversal)
    |-- Dashboard (research prompt management, pipeline actions)
    |
    v
@neo/shared
    |-- Neo4j AuraDB (graph storage, vector index)
    |-- Gemini embedding-001 (768-dim embeddings)
```

### 3-Tier Schema

- **Tier 0: MasterDomain** -- Top-level grouping (e.g., "E-commerce")
- **Tier 1: Domain** -- Subject area within a master domain (e.g., "SEO", "Pricing")
- **Tier 2: KnowledgeNode** -- Individual knowledge claims with embeddings, evidence, confidence

Relationships between nodes carry typed properties (causal, epistemic, contextual, structural).

## MCP Tools

| Tool                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `ping`                  | Connectivity check                                       |
| `health_check`          | Neo4j + Gemini health with latency                       |
| `schema_info`           | Node types and relationship categories                   |
| `graph_stats`           | Node counts, relationship counts, vector index status    |
| `list_master_domains`   | List all master domains                                  |
| `create_master_domain`  | Create a master domain (duplicate slug check)            |
| `list_domains`          | List domains (optional master domain filter)             |
| `create_domain`         | Create a domain under a master domain                    |
| `delete_domain`         | Delete a domain and its relationships                    |
| `list_knowledge_nodes`  | List nodes with pagination and domain filter             |
| `create_knowledge_node` | Create node with auto-generated Gemini embedding         |
| `update_knowledge_node` | Update node (re-embeds on definition/summary change)     |
| `delete_knowledge_node` | Delete a knowledge node                                  |
| `query_knowledge`       | RAG: embed query, vector search, 1-hop graph traversal   |
| `synthesize_research`   | Full synthesis: extract claims, embed, ingest into graph |
| `synthesize_dry_run`    | Preview claim extraction without persisting to graph     |
| `synthesize_batch`      | Process multiple research texts sequentially             |
| `synthesize_review`     | Review synthesis run history with pagination             |

## Prerequisites

- Node.js 22+
- pnpm 9+
- Neo4j AuraDB instance
- Google Gemini API key
- Anthropic API key (for synthesis tools)

## Setup

```bash
git clone https://github.com/tyleramurray/neo.git
cd neo
pnpm install
pnpm build
```

### Environment Variables

Create a `.env` file or set these in your environment:

```bash
# Required
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
API_KEYS='{"your-api-key": "client-name"}'

# Optional (defaults shown)
PORT=3000
EMBEDDING_DIMENSIONS=768
EMBEDDING_MODEL=gemini-embedding-001
LOG_LEVEL=info
CORS_ORIGINS=*
RATE_LIMIT_PER_MIN=100
```

## Development

```bash
pnpm build        # Build all packages
pnpm test         # Run tests (vitest)
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
```

## Running

```bash
pnpm -F @neo/server start
```

The server starts on `0.0.0.0:PORT` with Streamable HTTP transport. Health check at `GET /health`.

## Deployment

Deploy to Render.com using the included Blueprint:

1. Push to GitHub
2. In Render dashboard: New > Blueprint > Connect this repo
3. Render reads `render.yaml` and creates the web service
4. Set the 5 secret environment variables in the Render dashboard

## Auth

All `/mcp` and `/api` endpoints require `Authorization: Bearer <key>`. Keys are defined in the `API_KEYS` environment variable as a JSON object mapping keys to client names.

The `/health` and `/dashboard` endpoints are unauthenticated.

Rate limiting uses a sliding window per client key (default: 100 requests/minute).

## Dashboard

A self-contained web UI for managing the research pipeline, available at `GET /dashboard`.

- **Auth** -- Prompts for API key on load, stores in sessionStorage, sends as Bearer token
- **Stats bar** -- Prompt counts by status (needs_review, queued, ready, researched, etc.)
- **Tabbed prompt list** -- Filter prompts by status, expand cards to see full prompt text
- **Actions** -- Approve/reject individual prompts, copy prompt text, paste research output
- **Pipeline controls** -- Approve All, Prepare Queue, Run Synthesis

The dashboard HTML is served without authentication. All data operations go through the `/api` REST endpoints which require Bearer auth (same keys as MCP).
