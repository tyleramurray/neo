---
description: "DEEP PROJECT UNDERSTANDING"
---

# Read & Investigate

First read ALL of the AGENTS.md file and README.md file super carefully and understand ALL of both! Then use your code investigation agent mode to fully understand the code, and technical architecture and purpose of the project.

## Investigation Order

1. **Foundation docs**
   - AGENTS.md - Agent coordination rules
   - CLAUDE.md - Project instructions
   - README.md - Project overview

2. **Architecture docs**
   - docs/architecture.md
   - docs/workflows.md
   - docs/decisions.md (active patterns)

3. **Code structure**
   - Entry points (pages, API routes)
   - Core components
   - Data models
   - Utilities and helpers

4. **Configuration**
   - package.json
   - tsconfig.json
   - Environment variables

## For Awake Project

Key areas to understand:
- `awake_frontend/src/app/` - Next.js App Router pages
- `awake_frontend/src/components/` - React components
- `awake_frontend/src/lib/` - Utilities and DB access
- `awake_n8n/workflows/` - n8n workflow definitions
- `docs/` - Architecture and planning docs

## Output

After investigation, you should understand:
- What the project does
- How it's structured
- Key patterns and conventions
- Where to make changes
