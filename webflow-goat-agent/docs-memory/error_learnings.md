# Error Learnings

## [YYYY-MM-DD] [Bug title]
**Issue:** [what broke]
**Root cause:** [why]
**Fix:** [what solved it]
**Pattern:** [prevention]

## Durable lessons merged from v5 webflow-kb/lessons.md (2026-07-16)

Format: `- [YYYY-MM-DD] [area] lesson — why it matters`

## Blank page / "nothing shows" — ordered causes (check in order)
1. Classes attached but no styles applied (API mode — style application is separate step)
2. Viewing published site, changes only staged (nothing live until publish)
3. Wrong page/locale — compare handoff outputs.page_id
4. IX2 opacity-0 initial state, interaction never built in Designer
5. Native slider/tabs/navbar not initialized (missing Designer `w-*` IDs)
6. `POST /pages/{id}/dom` replaced all content (merge step skipped)
Causes 1/4/5 = Designer work, not API-fixable.

## Durable lessons
- [2026-05] api: POST /pages/{id}/dom replaces entire page — merge always.
- [2026-05] cms: name/slug fields auto-exist — POSTing them = 422 abort.
- [2026-06] styles: MCP style_tool only programmatic style path; REST cannot create class styles.
- [2026-06] ix2: no API exists; pre-hiding elements via class opacity:0 = blank sections.
- [2026-06] components: API-created slider/tabs/navbar/dropdown dead until re-added in Designer.
- [2026-06→corrected 2026-07-18] accordion: native `dropdown` component (+ IX2 open/close in Designer) — NOT <details>/<summary> (not a native Webflow element; old v5 lesson was wrong). Never height-animation JS.
- [2026-07] system: evidence = site read-back only; agent self-claims caused false "complete" reports.
- [2026-07-28] scripts: `npm i <one> --no-save` at home dir PRUNES the other --no-save deps (installing pngjs/pixelmatch removed ws → "Cannot find module 'ws'"). Always install the whole set in one command: `npm i ws pngjs pixelmatch --no-save`.
- [2026-07-28] verify: `state-shot.js` + `motion-verify.js` both run against `file://` references, so an HTML delivery is measurable exactly like a live URL — hover/scroll/load parity is data, not opinion. On a REFERENCE load pass, `moved:false` + `jankProps:["width"]` is layout settling, not animation; judge jank only on rows that moved.
- [2026-07-28] mcp: Webflow MCP 2.0.1 — call `webflow_guide_tool` first, pass `site_id` explicitly, and check `data_agent_instructions_tool > search_instructions` for site-owned rules/skills. Components + props + variants + slots are now API-buildable (no Designer handoff); INTERACTIONS still has no API.
