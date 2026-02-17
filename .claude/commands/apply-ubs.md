---
description: "RUN BUG SCANNER AND FIX ALL ISSUES"
---

# Apply UBS (Universal Bug Scanner)

Read about the ubs tool in AGENTS.md. Now run UBS and investigate and fix literally every single UBS issue once you determine (after reasoned consideration and close inspection) that it's legit.

## Process

1. Run the bug scanner / linter
2. Review each issue carefully
3. Determine if it's a real problem or false positive
4. Fix legitimate issues
5. Document any false positives to suppress

## For Awake Project

Since we don't have UBS specifically, use these alternatives:

```bash
# TypeScript errors
npm run build 2>&1 | head -50

# ESLint issues
npm run lint 2>&1 | head -50

# Test failures
npm run test:run 2>&1 | grep -E "(FAIL|Error)" | head -20
```

Fix all legitimate issues found. Don't just suppress warnings - understand and address root causes.
