---
name: session-recovery
description: Multi-session resume — read build_state.json, verify last work, detect orphans, rebuild corrupted state. Run at session start.
---

# Session Recovery

1. **Read build_state.json.** Missing/empty → fresh build, init state. Corrupted → rebuild from Designer (element_snapshot_tool).

2. **Find resume point.** Last "responsive" section → next section to build. "built" but not "verified" → run pixel-verify. "in-progress" → check DOM, complete or rebuild. recovery_point set → use that.

3. **Verify previous work.** For each "verified"/"responsive" section: element_snapshot_tool → compare node_ids in state. Nodes missing/changed → warn, re-verify or rebuild.

4. **Detect orphans.** Compare DOM sections vs build_state sections. Orphan in DOM not in state → add or ask user. Section in state not in DOM → rebuild or remove.

5. **Check pending work.** Read pending_designer_work.md → surface unchecked items → don't claim complete.

6. **Report:** resume point, section statuses, orphans, pending items.

**Auto-resume OK:** all previous sections "responsive", next has complete intake spec, no orphans, registry in sync.
**User confirmation needed:** uncertain status, orphans detected, corrupted state rebuilt, incomplete intake spec.
