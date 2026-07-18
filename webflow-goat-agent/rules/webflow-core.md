# Webflow Routing (v1.2 — GOAT agent system)

ALL Webflow work — any size, any source (Figma / screenshot / HTML / live URL / description) — is handled by the **webflow-goat** agent (`~/.claude/agents/webflow/webflow-goat.md`) or done inline following its rules. It works end-to-end inline: intake → build → pixel-verify → responsive-pass.

- Do NOT use the retired v5 system: no `webflow-builder` spawns, no complexity classifier, no `~/.claude/webflow-kb/` (retired 2026-07-16 → backups; lessons merged into `docs/memory/webflow/error_learnings.md`).
- Skills (lazy, one per need): design-intake (Figma/screenshot/HTML) · url-intake (live URL ONLY) · figma-setup · pixel-verify · responsive-pass · build-reference · session-recovery. Source isolation: never load the other source's skill/cache.
- Project memory: `docs/memory/webflow/` — registry.md (single file, grep sections) · build_state.json · pending_designer_work.md (17+ open items — surface before claiming done) · impossible_cases.md · error_learnings.md.
