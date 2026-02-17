---
description: "FIND MOST IMPACTFUL BEAD WITH BV"
---

# Use BV (Beads Viewer)

Use bv with the robot flags (see AGENTS.md for info on this) to find the most impactful bead(s) to work on next and then start on it.

Remember to mark the beads appropriately and communicate with your fellow agents.

## BV Commands

```bash
bv                          # Launch interactive TUI
bv --robot-triage           # Get AI-suggested priorities
bv --robot-triage --json    # Machine-readable output
```

## Process

1. Run `bv --robot-triage` to get prioritized suggestions
2. Review the recommendations
3. Pick the highest-impact bead you can work on
4. Claim it: `bd update <id> --status in_progress`
5. Notify other agents via Agent Mail
6. Execute the task
7. Mark complete: `bd close <id>`

## Impact Factors

BV considers:
- Blocking factor (how many other beads depend on this?)
- Priority setting
- Age (older beads may need attention)
- Complexity estimates
