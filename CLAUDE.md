# Neo

## Project Structure

```
/neo (project root)
├── CLAUDE.md                 # This file - project foundation
├── /.claude                  # Claude Code configuration
│   ├── /commands             # Custom slash commands
│   ├── /agents               # Custom agents
│   └── settings.json         # Plugin and hook config
└── ...                       # Your code goes here
```

## Tech Stack

<!-- Update this as you set up the project -->

- TBD

## Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm run test                   # Run tests
npm run lint                   # Run linter
```

## Development Workflow (Claudikins-Kernel)

Uses the **claudikins-kernel** framework for iterative planning with human checkpoints.

### Core Workflow Commands

| Command    | Purpose                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `/outline` | **Planning** - Iterative planning with human checkpoints at every phase           |
| `/execute` | **Execution** - Execute validated plans with isolated agents and two-stage review |
| `/verify`  | **Verification** - Tests, lint, type-check, then see it working                   |
| `/ship`    | **Shipping** - PR creation, documentation updates, and merge with human approval  |

### Supporting Commands

| Command             | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `/status`           | Quick project status check (branch, next task, progress) |
| `/research [topic]` | Investigate and understand. READ ONLY, no code changes   |
| `/innovate [topic]` | Brainstorm 2-3 approaches with pros/cons                 |

### Typical Feature Workflow

```
/outline [feature]       # Plan with human checkpoints
/execute                 # Implement with isolated agents
/verify                  # Run tests, lint, type-check
/ship                    # Create PR, update docs, merge
```

### Debugging

```
/klaus                   # Summon Klaus for systematic 8-phase debugging
```

## Claude's Direct Access (MCP Tools)

### MCP Servers Available

| MCP Server   | Type  | Purpose                   |
| ------------ | ----- | ------------------------- |
| `render`     | stdio | Infrastructure management |
| `n8n-mcp`    | stdio | n8n automation            |
| `playwright` | stdio | Testing, debugging        |
| `github`     | http  | Code collaboration        |

## DO NOT

- Modify .env files directly (ask first)
- **WRITE CODE WITHOUT COMPLETING /outline** - Human approval required before execution
- Commit without testing locally first
- Push directly to main without review
- Skip `/verify` before `/ship` - evidence of working code required
