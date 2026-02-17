---
description: "FULL GITHUB WORKFLOW"
---

# GitHub Flow

Do all the GitHub stuff: commit, deploy, create tag, bump version, release, monitor gh actions, compute checksums, etc.

## Full Release Workflow

### 1. Commit & Push
```bash
git add -A
git commit -m "Release vX.Y.Z"
git push origin main
```

### 2. Create Tag
```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z - Description"
git push origin vX.Y.Z
```

### 3. Monitor CI
```bash
gh run list --limit 5
gh run watch  # Watch latest run
```

### 4. Create Release
```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "Release notes here" \
  --latest
```

### 5. Verify Deployment
- Check Render dashboard for deploy status
- Verify production site is working
- Check logs for errors

## For Awake Project

We deploy via Render auto-deploy on push to main:
- Frontend: awake.am
- n8n: n8n.awake.am

Monitor deploys:
```bash
# Use Render MCP tools to check deploy status
```
