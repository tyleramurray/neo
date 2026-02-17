---
description: "CONVERT PLAN TO BEADS DAG"
---

# Generate Beads

OK so please take ALL of that and elaborate on it more and then create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed comments so that the whole thing is totally self-contained and self-documenting (including relevant background, reasoning/justification, considerations, etc.-- anything we'd want our "future self" to know about the goals and intentions and thought process and how it serves the over-arching goals of the project.)

Use the `bd` tool repeatedly to create the actual beads.

## Beads Commands Reference

```bash
bd add "Task description"                    # Create new bead
bd add "Subtask" --depends-on=ID            # Create with dependency
bd add "Task" --priority=high               # Set priority
bd ready                                     # Show beads ready to work on
bd stats                                     # Project statistics
```

## Guidelines

1. Break down into atomic, actionable tasks
2. Set up dependencies so tasks can be parallelized
3. Add enough context in descriptions for future reference
4. Use consistent naming conventions
5. Group related tasks with tags or prefixes

## Context

$ARGUMENTS
