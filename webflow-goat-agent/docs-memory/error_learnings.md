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
- [2026-07-28] mcp-protocol: spec `2026-07-28` shipped (prev `2025-11-25`; separate from the Webflow server's `2.0.1`). Handled version-agnostically — NO protocol branching in the agent: preamble re-runs on reconnect/site-switch/tool-list change · read-back counts only if post-write + fresh (list/read results may carry `ttlMs`/`cacheScope`) · `InputRequiredResult` = retry same tool with `inputResponses` + echoed state, never auto-answer a user-reserved prompt · missing-resource code is `-32002` (old) or `-32602` (new), same fix · tool inputs may be JSON Schema 2020-12 conditional → re-read schema on validation error, `structuredContent` may be any JSON · store task ids (`tasks/list` gone on new) · roots/sampling/logging deprecated · MCP App HTML is client UI, never build output.
- [2026-07-28] state: `build_state.json` was referenced 17× and **never existed**; `registry.md` was a 263-byte stub missing all 12 sections the rules grep (`## Motion-Recipes`, `## Custom-Code-Exceptions`…). Every rule depending on them was a silent no-op — recipes never matched, code-exception whitelist had nothing to check, crash recovery had nothing to read. Lesson: a rule that points at a file nobody created is worse than no rule, because reports still read as if it ran. `wf-lint.js` now fails on exactly this class of drift.
- [2026-07-28] state: one global `pending_designer_work.md` held 17 items from a single 2026-07-03 blog build, so EVERY later build on ANY site inherited a permanently-blocked "complete" — which trains ignoring the ledger. Fixed by per-site state (`sites/<site-id>/`), shared learnings/impossible-cases at the root.
- [2026-07-28] scripts: all verification commands were `docs/memory/webflow/*.js` **relative**, so running from any project directory silently degraded every gate to prose (the failure mode is "gate skipped", not "command errored"). Fixed: `$WF/scripts/` absolute root + a usage guard in each script + old-path forwarders for one version.
- [2026-07-28] deps: `npm i <x> --no-save` at the home dir prunes the other `--no-save` packages (this broke `ws` once already). Fixed permanently with `$WF/package.json` + a real `npm install`; never use `--no-save` for these again.
- [2026-07-28] verify: the pixel gate had two proven blind spots — a section **200px too tall PASSed** (the differ cropped to the shorter image and printed height mismatch as a note), and **one destroyed component PASSed at 98.5% global** (1.5% of pixels is under the 3% budget). Both now hard-FAIL (height >2%, any 12×12 cell >25%), and `pixel-diff.test.js` keeps them failing. Nearest-neighbour resize also replaced with area-average, which stops type-heavy sections being penalised for resampling noise.
- [2026-07-28] a11y: first `page-audit.js` run against a real published page (`new-site-063406.webflow.io`) found 7 genuine contrast failures at **3.86:1** on `.faq__question` (white on `rgba(149,119,162,.95)`) that every previous pixel-perfect pass had scored as PASS — pixel fidelity and accessibility are independent axes. Also: exclude `.w-webflow-badge` from any audit; Webflow's own chrome is unfixable and produces a permanent false FAIL.

