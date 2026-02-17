RUN TEST SUITE (project)

Your task: Execute the test suite and report results.

## Test Suites Available

| Suite | Command | Description |
|-------|---------|-------------|
| Unit/Integration | `npm run test:run` | 230 Vitest tests (security, auth, API) |
| E2E Browser | `npm run test:e2e` | 38 Playwright tests (10 active, 28 skipped*) |

*E2E tests for authenticated routes are skipped pending real auth setup.

## Execution Steps

1. Navigate to `awake_frontend/` directory

2. Run unit/integration tests:
   ```bash
   npm run test:run
   ```

3. Run E2E browser tests:
   ```bash
   npm run test:e2e
   ```

4. Report results for BOTH suites:
   - Tests passed/failed/skipped per suite
   - Any failing tests with file and test name
   - Summary by category

## Arguments

- `$ARGUMENTS` can specify which suite to run:
  - `unit` or `vitest` - Run only Vitest tests
  - `e2e` or `playwright` - Run only Playwright E2E tests
  - `all` (default) - Run both suites
  - Any other value - Passed as pattern to Vitest (e.g., "security")

Examples:
- `/test` - Runs both suites
- `/test e2e` - Runs only Playwright tests
- `/test security` - Runs only security tests (Vitest)

## If Tests Fail

- Identify the failing test(s)
- Diagnose the issue
- Suggest or implement fixes if appropriate
- Re-run to verify fix
