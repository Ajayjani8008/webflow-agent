---
name: session-recovery
description: Multi-session resume — read the site's build_state.json, verify last work, detect orphans, recover open tasks, rebuild corrupted state. Run at session start.
---

# Session Recovery

**State is per site (v1.9.0):** `$WF/sites/<site-id>/` where `WF="$HOME/docs/memory/webflow"` — `registry.md` · `build_state.json` · `pending_designer_work.md` · `specs/<section>.md` (the written intake contract) · `figma-cache/` · `ref-cache/`. Shared at `$WF/`: `error_learnings.md`, `impossible_cases.md`, `scripts/`, `package.json`. Never write another site's files; never let another site's pending items block this one.

**0. RESOLVE `<site-id>` FIRST — derive, never invent.** A guessed folder name splits one site's state across two directories and neither is complete, which is worse than having none. Order: ① `ls $WF/sites/` → reuse the dir whose `build_state.json` carries this `site.site_id` (match the id, not the name — names get renamed in Webflow) ② no match → try the site's shortName/slug as the dir name; a dir exists with that name but no matching `site_id` → read it before assuming, it may be the same site recorded before ids were stored ③ still nothing → copy `sites/_template/` to `sites/<slug>/` and write `site.id`/`site.name`/`site.site_id` immediately, before any build work. State the resolved id in the recovery report. Never derive the id from a page name, a Figma file, or the current working directory.

1. **Read `sites/<site-id>/build_state.json`.** Missing/empty → fresh build, init from `sites/_template/build_state.json` (its `_schema` block documents every field: `sections[]` with status/node_ids/pixel_score/breakpoints/reports/a11y_perf/publishes · `tasks[]` · `snapshots[]` · `recovery_point` · `portable`). Corrupted → rebuild from the Designer (`element_snapshot_tool`) and say so in the report.

**COLD RESUME IS THE NORMAL CASE (v1.10.0).** Multi-section work runs one section per session (agent Rule 8), so most sessions start with no history at all — that is by design, not a failure. Everything needed is on disk: `build_state.json` (what is done, scores, publishes, open tasks), `specs/<section>.md` (the build contract + effect manifest for the next section), `registry.md` (classes/variables/components already created — **grep this before creating anything, or a fresh session will duplicate what session 1 built**), `pending_designer_work.md` (this site's open `[critical]` items). If a section's spec file is missing, intake must re-run for that section — never build from a guess.

2. **Find the resume point.** Last section at `responsive` → next section. `built` but not `verified` → run pixel-verify. `in-progress` → read the DOM, complete or rebuild. `recovery_point` set → use it.

3. **Verify previous work — with a fresh read.** For each `verified`/`responsive` section: `element_snapshot_tool` → compare against the stored `node_ids`. Missing/changed → warn, re-verify or rebuild. A read identical to a pre-session read is cache-suspect → re-issue with a different query shape before concluding anything (agent Rule 5).

4. **Detect orphans.** DOM sections vs state sections. In DOM, not in state → add or ask. In state, not in DOM → rebuild or remove.

5. **Check pending work — this site only.** Read `sites/<site-id>/pending_designer_work.md`; open `[critical]` items block "complete" for the sections that own them. Another site's items are never surfaced here (one un-scoped global ledger used to block every build with 17 unrelated items — that is why it is per-site now).

6. **Recover open tasks.** `tasks[]` holds server task ids for long operations (publish, bulk asset upload). Poll each (`tasks/get`) before assuming a publish never happened — new-spec servers have no task list to fall back on, so an id that was never stored is unrecoverable.

7. **Check snapshots.** `snapshots[]` records pre-destructive captures. An entry whose rebuild never completed = work interrupted mid-destroy → restore from it or rebuild that subtree before anything else.

8. **Report:** resume point · section statuses · orphans · this site's open `[critical]` items · open tasks · anything rebuilt from the Designer.

**Auto-resume OK:** all previous sections `responsive`, next has a complete intake spec, no orphans, registry in sync, no open tasks.
**User confirmation needed:** uncertain status, orphans, corrupted state rebuilt, incomplete intake spec, an open task whose result is unknown, an unfinished snapshot entry.
