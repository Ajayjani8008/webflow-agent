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
- [2026-06] accordion: use native <details>/<summary>, never height animation JS.
- [2026-07] system: evidence = site read-back only; agent self-claims caused false "complete" reports.
