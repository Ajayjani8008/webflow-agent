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
- [2026-07-28] state: a per-site layout is only safe if the site KEY is derived, not invented — `sites/<site-id>/` with a guessed name splits one site across two dirs (two registries, two build_states, neither complete), which is worse than one global file. Derive by matching `build_state.site.site_id`, then the Webflow shortName/slug; never from a page name, Figma file, or cwd.
- [2026-07-28] backup: fixing a bug in the live pack does NOT fix the copy in the repo — the repo still held the OLD permissive `pixel-diff.js` plus the stub registry and un-scoped ledger, so a restore would have reinstalled every bug just fixed. A version bump must delete the superseded layout, not just add the new one. `wf-sync.sh` also has to carry real per-site state, or the registry/pending ledger silently never leave the machine.
- [2026-07-28] tooling: a lint baseline captured BEFORE the fixes makes `--compare` measure against the broken past, so a partial regression reads as an improvement. Re-cut the baseline at 0/0 the moment the sweep is clean.
- [2026-07-28] cost: a single slider section burned ~197k tokens. Root cause was NOT instruction size (a full slider T1 load is ~33k, one time) and NOT payload size — it is that **every tool result is re-sent with every later call, so N calls cost ~N²/2 in context**. A 60-call section pays for its early results sixty times. The three real drivers, in order: (1) call count, (2) opened PNGs — ~1-2k each AND re-sent for the rest of the session, (3) long single sessions carrying earlier sections. Batching *writes* (the old "token discipline") touched none of them.
- [2026-07-28] cost: fixes that worked, all accuracy-neutral — one consolidated `verify-section.js` call replacing ~12 (shots+diffs+audits+states); one section per session with the intake spec WRITTEN to `sites/<id>/specs/<section>.md` so a cold session resumes with no history; image discipline (open the reference always, one anchor compare, then only FAILED/UNSCORED shots — a PASS is measured more strictly than an eye); read narrow (never `depth -1`, never page-root `get_metadata`); auto-skeleton module recipe (Slider/Tabs/Navbar/Dropdown/Form: create bare → ONE subtree read → ONE style batch → ONE settings batch → ONE builder call, and never re-read the subtree between edits).
- [2026-07-28] cost: strict fail-closed gates COST tokens (more FAILs → more fix passes) and that is the correct trade — but it must be visible, so a section reports at ~60k and stops to ask at ~100k. A cost checkpoint is a report, never permission to leave a CRITICAL/MAJOR diff open.
- [2026-07-28] verify: `element_snapshot_tool` is free of *publishing*, not free of tokens — it returns an image. Use a text read-back to learn a value, a snapshot only to SEE something. The old pack called snapshots "free", which encouraged exactly the wrong habit.

