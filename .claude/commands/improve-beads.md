---
description: "ITERATE IN PLAN SPACE"
---

# Improve Beads

Check over each bead super carefully-- are you sure it makes sense? Is it optimal? Could we change anything to make the system work better for users? If so, revise the beads.

It's a lot easier and faster to operate in "plan space" before we start implementing these things!

## Review Checklist

1. **Clarity** - Is each bead description clear and actionable?
2. **Granularity** - Are beads appropriately sized? Not too big, not too small?
3. **Dependencies** - Are dependencies correctly set up? Any missing?
4. **Order** - Is the dependency graph optimal for parallelization?
5. **Completeness** - Are any tasks missing?
6. **Redundancy** - Are any beads duplicative?
7. **Priority** - Are priorities set correctly?

## Commands

```bash
bd ready                    # See what's available
bd show <id>               # View bead details
bd update <id> --desc "new description"  # Update description
bd update <id> --depends-on=<other-id>   # Add dependency
bd close <id>              # Close if no longer needed
```

Think carefully about the plan before executing!
