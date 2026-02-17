---
description: "EXECUTE BEADS SYSTEMATICALLY"
---

# Work on Beads

OK, so start systematically and methodically and meticulously and diligently executing those remaining beads tasks that you created in the optimal logical order!

Don't forget to mark beads as you work on them.

## Workflow

1. Check what's ready: `bd ready`
2. Pick a bead to work on
3. Claim it: `bd update <id> --status in_progress`
4. Do the work
5. Mark complete: `bd close <id>`
6. Repeat

## Guidelines

- Work in dependency order
- Don't skip ahead - complete prerequisites first
- Update status as you go so others know what's in progress
- If you get blocked, note it and move to another bead
- Communicate via Agent Mail if working with other agents

## Commands Reference

```bash
bd ready                              # Show available beads
bd update <id> --status in_progress   # Claim a bead
bd close <id>                         # Mark complete
bd blocked                            # Show blocked beads
bd stats                              # View progress
```
