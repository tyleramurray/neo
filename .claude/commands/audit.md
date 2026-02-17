# COMPREHENSIVE CODEBASE AUDIT

Your task: Execute a comprehensive audit of the Awake platform and generate an AI-machine-readable report.

**Scope:** $ARGUMENTS (defaults to "all" if empty)
- `all` - Full audit of all 4 repos
- `frontend` - Just awake_frontend
- `n8n` - Just n8n workflows
- `mcp` - Just awake_mcp
- `docs` - Just documentation accuracy
- `security` - Security-focused audit only
- `integration` - Cross-repo integration points only

## Critical Rules

1. **REPORT ONLY** - Do not fix any issues. Document findings with locations and suggested approaches.
2. **COMPLETE ALL PHASES** - Do not stop early. Complete all phases before generating the final report.
3. **BE SPECIFIC** - Always include exact file paths, line numbers, and workflow IDs.
4. **USE MCP TOOLS** - Use n8n-mcp and render MCP tools for live system checks.

---

## Phase 0: Setup

1. Determine audit scope from $ARGUMENTS (default: all)
2. Record start time
3. Create output directory:
   ```bash
   mkdir -p docs/audits
   ```
4. Capture current git state for each repo:
   ```bash
   cd /workspaces/awake && git rev-parse --short HEAD
   cd /workspaces/awake/awake_frontend && git rev-parse --short HEAD
   cd /workspaces/awake/awake_n8n && git rev-parse --short HEAD
   cd /workspaces/awake/awake_mcp && git rev-parse --short HEAD
   ```

---

## Phase 1: Baseline Tests (Sequential)

Run existing test suites first to establish baseline:

```bash
cd /workspaces/awake/awake_frontend
npm run test:run 2>&1 | tee /tmp/audit-vitest.log
npm run test:e2e 2>&1 | tee /tmp/audit-playwright.log
```

Record:
- Total tests: passed/failed/skipped for each suite
- Any failures with test names and file locations
- Test coverage if available

---

## Phase 2: Per-Repo Discovery (Parallel Agents)

Spawn agents based on scope. For "all" scope, spawn all 4 in parallel:

### Agent 1: Parent Repo Audit
```
Audit the parent /workspaces/awake repository.

Check:
1. CLAUDE.md accuracy - Does it match actual codebase state?
   - Are the listed workflows current? (compare to n8n-mcp list)
   - Are the database tables accurate?
   - Are the slash commands documented correctly?

2. docs/ accuracy:
   - docs/architecture.md vs actual system
   - docs/workflows.md vs live n8n workflows
   - docs/implementation-plan.md - any stale items?
   - docs/decisions.md - active patterns current?

3. .claude/ configuration:
   - Are all agents valid?
   - Are all commands working?
   - Any orphaned or unused configs?

Output findings in this YAML format:
```yaml
phase: parent-repo
issues:
  - id: PARENT-001
    severity: [critical|high|medium|low]
    category: documentation
    file: CLAUDE.md
    line: 45
    title: Outdated workflow count
    description: States 10 workflows but n8n has 11
    suggested_fix: Update workflow count to 11
    fix_complexity: simple
```
```

### Agent 2: Frontend Audit
```
Audit /workspaces/awake/awake_frontend

1. Dependency scan:
   - Run: npm audit --json
   - Check for outdated packages: npm outdated
   - Look for unused dependencies

2. Dead code scan:
   - Unused exports (exported but never imported elsewhere)
   - Unused imports at top of files
   - Functions defined but never called
   - Files never imported
   - Commented-out code blocks (>10 lines)

3. Incomplete implementation scan:
   - TODO comments
   - FIXME comments
   - Empty catch blocks
   - Console.log statements (debug leftovers)
   - Empty function bodies

4. Error handling patterns:
   - API routes without try/catch
   - Async functions without error handling
   - Catch blocks that only log

5. Type safety:
   - Any 'any' types that could be stricter
   - Missing return types on functions

Output in YAML format with file:line locations.
```

### Agent 3: n8n Workflow Audit (Use MCP Tools)
```
Audit n8n workflows using MCP tools.

1. Get live workflow state:
   Use mcp__n8n-mcp__n8n_list_workflows to get all workflows

2. For each workflow, validate:
   Use mcp__n8n-mcp__n8n_validate_workflow for structural checks

3. Check for recent errors:
   Use mcp__n8n-mcp__n8n_executions with action='list', status='error'

4. Compare live vs exports:
   - Read awake_n8n/workflows/*.json
   - Compare to live workflow data
   - Flag workflows that exist live but not exported
   - Flag exports that don't match live

5. Check webhook integration:
   - List all webhook paths from n8n
   - Verify frontend has corresponding calls
   - Flag orphaned webhooks

6. Workflow-specific checks:
   - Missing error handling nodes
   - Hardcoded values that should be env vars
   - Duplicate logic across workflows
   - Inactive workflows that should be active (or vice versa)

Output in YAML format with workflow IDs and node names.
```

### Agent 4: MCP Server Audit
```
Audit /workspaces/awake/awake_mcp

1. Code quality:
   - Review implementation for issues
   - Check error handling

2. Dependencies:
   - npm audit for vulnerabilities
   - Outdated packages

3. Configuration:
   - Are MCP tools properly defined?
   - Any tools that don't work?

Output in YAML format.
```

---

## Phase 3: Cross-Cutting Analysis (Parallel Agents)

### Agent 1: Security Review
```
Use the security-reviewer agent patterns on:
- awake_frontend/src/app/api/ (all API routes)
- Any auth-related code
- Database query patterns
- n8n webhook integration

Check the security checklist from .claude/agents/security-reviewer.md:
- SQL injection vulnerabilities
- Auth bypass possibilities
- Multi-tenant data isolation
- XSS vectors
- Rate limiting coverage
- Secrets exposure

Output in YAML format with severity ratings.
```

### Agent 2: Integration Points Audit
```
Check cross-repo integration consistency:

1. Frontend API ↔ n8n webhooks:
   - List all n8n webhook endpoints
   - List all frontend fetch calls to n8n
   - Flag mismatches (frontend calls non-existent webhook, etc.)

2. Database schema ↔ code:
   - Read current schema from db
   - Compare to queries in frontend code
   - Flag queries for columns that don't exist
   - Flag unused columns

3. Environment variables:
   - List all env vars referenced in code
   - Compare to documented env vars in CLAUDE.md
   - Flag undocumented variables

4. Shared types/contracts:
   - Check if frontend types match n8n response structures
   - Flag type mismatches

Output in YAML format.
```

### Agent 3: Infrastructure Health
```
Check production infrastructure health:

1. Render services:
   Use mcp__render__list_services to get all services
   Use mcp__render__list_logs with errors for recent issues

2. n8n execution health:
   Use mcp__n8n-mcp__n8n_executions to check recent execution status
   Calculate success rate

3. Database health:
   Check for any connection issues in logs

Output in YAML format with metrics.
```

---

## Phase 4: Report Synthesis

After all agents complete, synthesize the final report.

### Report Structure

Create file: `docs/audits/[YYYY-MM-DD].md`

```markdown
---
type: awake_audit_report
version: 1.0
generated: [ISO timestamp]
duration_minutes: [calculated]
scope: [all|frontend|n8n|etc]
repos:
  - name: awake
    path: /workspaces/awake
    commit: [sha]
  - name: awake_frontend
    path: /workspaces/awake/awake_frontend
    commit: [sha]
  - name: awake_n8n
    path: /workspaces/awake/awake_n8n
    commit: [sha]
  - name: awake_mcp
    path: /workspaces/awake/awake_mcp
    commit: [sha]
baseline_tests:
  vitest:
    passed: [n]
    failed: [n]
    skipped: [n]
  playwright:
    passed: [n]
    failed: [n]
    skipped: [n]
summary:
  total_issues: [n]
  by_severity:
    critical: [n]
    high: [n]
    medium: [n]
    low: [n]
  by_category:
    security: [n]
    n8n: [n]
    dead_code: [n]
    error_handling: [n]
    dependencies: [n]
    documentation: [n]
    integration: [n]
    type_safety: [n]
---

# Awake Audit Report - [DATE]

## Executive Summary

**Overall Health:** [CRITICAL | CONCERNING | MODERATE | HEALTHY]

**Top 5 Priority Items:**
1. [ISSUE-ID]: [one-line summary] ([file:line] or [workflow:node])
2. ...

---

## Critical Issues (Fix Immediately)

### ISSUE-001
```yaml
id: ISSUE-001
severity: critical
category: security
repo: awake_frontend
file: src/app/api/example/route.ts
line: 45-47
title: [Clear title]
description: |
  [Detailed description of the issue]
code_snippet: |
  [Current problematic code]
suggested_fix: |
  [Specific fix with code example]
fix_complexity: [simple|medium|complex]
requires_test: [true|false]
related_issues: [ISSUE-XXX, ...]
```

---

## High Priority Issues (Fix This Week)

[Same format as Critical]

---

## Medium Priority Issues (Fix This Month)

[Same format, can be condensed]

---

## Low Priority Issues (Backlog)

[Brief list format]

---

## Summary by Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | | | | |
| n8n Workflows | | | | |
| Dead Code | | | | |
| Error Handling | | | | |
| Dependencies | | | | |
| Documentation | | | | |
| Integration | | | | |
| Type Safety | | | | |

---

## Test Baseline

### Vitest (Unit/Integration)
- Passed: [n]
- Failed: [n]
- Skipped: [n]

[List any failures with file:testName]

### Playwright (E2E)
- Passed: [n]
- Failed: [n]
- Skipped: [n]

[List any failures]

---

## Recommended Fix Sequence

Based on severity, dependencies between fixes, and complexity:

### Immediate (Before Next Deploy)
1. [ISSUE-ID] - [description] - [complexity]

### This Week
1. ...

### This Month
1. ...

---

## n8n Workflow Status

| Workflow | ID | Active | Last Execution | Status |
|----------|-----|--------|----------------|--------|
| [name] | [id] | [yes/no] | [timestamp] | [success/error] |

---

## Appendix: Raw Findings by Phase

<details>
<summary>Phase 1: Baseline Tests</summary>

[Raw test output]

</details>

<details>
<summary>Phase 2: Per-Repo Discovery</summary>

[YAML from each agent]

</details>

<details>
<summary>Phase 3: Cross-Cutting Analysis</summary>

[YAML from each agent]

</details>
```

---

## Completion

When the report is saved to `docs/audits/[YYYY-MM-DD].md`:

1. Output the file path
2. Summarize: total issues found by severity
3. List the top 3 most critical items
4. State: `AUDIT_COMPLETE`

---

## Using This Report Later

To fix issues from this report:

```
"Read docs/audits/YYYY-MM-DD.md and fix all critical issues"
"Fix all dead_code category issues from the latest audit"
"Fix ISSUE-005 from the audit report"
```

The YAML structure allows Claude to parse and execute fixes programmatically.
