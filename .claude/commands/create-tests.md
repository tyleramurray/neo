---
description: "COMPREHENSIVE TEST COVERAGE"
allowed-tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"]
---

# Create Tests

Do we have full unit test coverage without using mocks/fake stuff? What about complete e2e integration test scripts with great, detailed logging? If not, then create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid with detailed comments.

## Test Categories to Cover

### Unit Tests (Vitest)
- Pure functions and utilities
- React hooks
- Data transformations
- Validation logic

### Integration Tests (Vitest)
- API routes
- Database operations
- Service layer functions

### E2E Tests (Playwright)
- Critical user flows
- Authentication
- Navigation
- Form submissions

## For Awake Project

```bash
# Current test status
npm run test:run 2>&1 | tail -20
npm run test:e2e 2>&1 | tail -20
```

## Guidelines

1. Prefer real implementations over mocks when possible
2. Test behavior, not implementation
3. Add detailed logging for debugging
4. Cover happy path AND error cases
5. Use `bd add` to create beads for test tasks

$ARGUMENTS
