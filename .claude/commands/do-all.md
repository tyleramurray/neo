---
description: "EXECUTE EVERYTHING WITH TRACKING"
---

# Do All

OK, please do ALL of that now. Track work via bd beads (no markdown TODO lists): create/claim/update/close beads as you go so nothing gets lost, and keep communicating via Agent Mail when you start/finish work.

## Execution Framework

### Before Starting
1. Review all beads: `bd ready`
2. Check Agent Mail for messages
3. Understand the full scope

### During Execution
For each task:
1. Claim: `bd update <id> --status in_progress`
2. Notify: Send Agent Mail about what you're starting
3. Execute: Do the actual work
4. Test: Verify it works
5. Complete: `bd close <id>`
6. Notify: Send Agent Mail about completion

### Tracking Rules
- NO markdown TODO lists - use beads only
- Update bead status in real-time
- Create new beads for discovered work
- Close beads immediately when done

### Communication
- Announce when starting significant work
- Report blockers immediately
- Share completion status
- Request help if stuck

### End of Session
Follow the "Landing the Plane" protocol in AGENTS.md:
1. File issues for remaining work
2. Update all bead statuses
3. `bd sync && git push`
4. Verify everything is pushed
