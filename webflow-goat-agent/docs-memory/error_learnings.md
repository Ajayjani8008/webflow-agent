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


## 2026-07-26 — hero build (node 709:2702)

**data-URI backgrounds are IMPOSSIBLE via data_style_tool.** The style store TRUNCATES the value at the first `;`, leaving `url("data:image/svg+xml` — for both `;utf8,` and `;base64,`. Worse, the truncated value is then unreconcilable: further `update_style` calls on that class fail with `MPS rejected update ... [Conflict]`, which reads like a transient multiplayer error but is not — the only recovery is to clear the property, then write fresh. FIX: never inline a data-URI. Upload the file (data_assets_tool create_asset -> presigned S3 POST -> hostedUrl) and set `background-image: url(<cdn hostedUrl>)`. CDN URLs contain no `;` so they store intact, and unlike data-URIs they also render on the Designer canvas.

**Figma "image" layers are raster and easy to miss.** A named `image` frame in the layer stack is a bitmap, not vectors/text — invisible in JSON property dumps but carrying real content (here: grid + threat-actor labels + 4 comet streaks). `get_metadata` reveals it; `download_assets` -> `rawImages[]` gives the exact source file. Always check the metadata layer stack for `image` frames before declaring a background complete.

**Hex/shape "outlines" in Figma are usually filled masks, not strokes.** cs-hex-b read as an outline in the render, but the source is a hex-masked gradient FILL at opacity 0.6. Building it as an SVG stroke produced a hollow hex with a red rim instead of a solid plate — cost a rebuild of 5 assets. Read the mask+fill structure from get_design_context before authoring the SVG.

**A Figma layer at `opacity: 0` is an animation layer, not a missing element.** cs-ping is a full accent-filled hex at opacity 0 — correct to omit statically, belongs in the motion queue. Don't "fix" it into visibility.

**mix-blend-mode does not reproduce Figma blend layers in Webflow.** A child div with `background rgba(255,255,255,0.25)` + `mix-blend-mode: saturation` rendered as a visible white box (no isolation context), a regression vs the plain icon. Equivalent native result: `filter: saturate(75%)` on the icon class (25%-alpha blend against white == 75% saturation retained). One property, no extra element.

**MCP publish can silently no-op.** `publish_site` returned success 3x while `lastPublished` stayed frozen and the published HTML never gained the section — then started working later with no change in the call. Never trust the publish response: poll `get_site.lastPublished` or grep the published HTML for a class you just added before shooting.

**Score against the reference PNG's TRUE dimensions.** The 709:2702 reference is 1400x876 (aspect 1.598 = the 1920x1200.9 frame). Resizing the build shot to 1400x900 stretched it 2.7% and scored 96.63% FAIL; at the correct 1400x876 the same build scored 97.90% PASS. Always read the reference header dims first — a wrong-aspect compare invents diffs everywhere.

## 2026-07-31 — example-hero build (node 1:1081)

**A BEM modifier only applies if it EXISTS as a real combo class.** `data_element_builder` `set_style`
and `data_element_tool` `set_style` both reject `style_names: [base, modifier]` with
`One or more styles not found: <base>, <modifier>` when the modifier was created as a plain global
class — even though both classes demonstrably exist. The pair is resolved as a combo-class CHAIN, so
the modifier must be created with `parent_style_names: [base]` (result then reports
`isComboClass: true`, `selector: ".base.modifier"`). Fix: `remove_style` the global modifier, re-create
it with `parent_style_names`, then apply both names. Single-class application always works, which is
why this only bites on modifiers.

**`data_element_builder` under-reports success — always run the post-batch read.** The call returned
`partial_success` listing only a handful of children, which read as "most of the tree failed". A
`query_elements` with `children_depth: -1` showed the ENTIRE tree had in fact been created correctly
(heading, paragraph with em-dash intact, link, label, icon, all three dots); the only real failures
were the four combo-class applications above. Never repair from the builder's response — diff against
a fresh subtree read, or you will duplicate elements that already exist.

**A Figma group can export as a 1x1 empty PNG.** Node 1:1089 "Pattern" (940x677, 20+ raw images in
its subtree) exported at 149 bytes / 1x1 via both `download_assets` and `get_screenshot
contentsOnly` — it is a mask group that does not render standalone. The visible product art was
entirely in a sibling (1:4887, a rounded-rect with an image fill). Check an export's real dimensions
before treating it as an asset, and confirm which node actually carries the artwork by LOOKING at it.

**Google Fonts variable faces install fine as Webflow custom fonts.** CSS2 returning ONE url for
weights 500/600/700 means the family is variable. Register once via `create_font` with
`axes: [{tag:"wght",min,max,default_value}]`, POST the bytes, and `font-weight` then selects the
instance — confirmed by a 99.93% pixel match on a 70px/600 Yrsa headline. Do not try to register the
same file three times: `file_hash` is content-addressed, so the three records collide.

## 2026-07-31 — example-header build (node 1:4897)

**A flex column anchored by `left` centres on its WIDEST child, not on the axis the design uses.**
The brand (logo + wordmark + tracked sub-line) was built as `position:absolute; left:32px; flex-column;
align-items:center`, so the whole group centred on the very wide letter-spaced "OF FRAGRANCES" and sat
**66px right** of the reference. Figma expressed it as three absolutely-positioned children each with
`translateX(-50%)` at `left:61px` — i.e. all centred on the LOGO axis. Fix: give the column the logo's
width (`width:55px`); wider nowrap children then overflow symmetrically, reproducing translateX(-50%).
Measure this with a bounding-box diff, not by eye — the shift read as "slightly off" but was 66px.

**Figma letterSpacing can contradict the Figma render — the render wins (Rule 1).** The brand sub-line
reported `tracking-[13.28px]` on a 6.832px font via `styleOverrideTable` spans. Applied literally it
produced a 162.5px line; the reference render measures 109px, and 10 characters at 13.28px tracking
cannot fit 109px at any interpretation. Built to the measured render width (7.93px) and logged the
contradiction. Always bbox-measure a tracked line against the render before trusting the number.

**Verify the capture and the reference describe the SAME BOX.** Scoring a full-width `.example-nav`
(1920px) against a reference cropped to the inner bar (1632px) made pixel-diff upscale the reference
1.18x: it reported "height delta 16.1% (118 vs 99)" and six middle-right hot regions on a build that
was actually fine. A right-edge cluster of hot regions plus a large height delta is the signature of a
width mismatch, not a layout bug. Composite the reference at the capture width first (here: paste the
1632px header at x=144 on #FDF9EA to rebuild the 1920px frame) — that alone moved the score from
94.56% to 98.29%.

**Dropdown auto-skeletons ship placeholder CONTENT, not just structure.** A bare `Dropdown` arrives as
DropdownToggle(Icon + Block "Dropdown") + DropdownList(3x DropdownLink "Link 1/2/3"). The toggle's
inner Block rejects `set_text` ("This element doesn't support text") exactly like TextBlock — remove it
and append a Paragraph. Delete the three placeholder links unless the design supplies real items, and
hide the default Icon with a `display:none` class when the design uses its own chevron asset. Always
grep the published HTML for "Link 1" / ">Dropdown<" before calling a nav done.

## 2026-08-01 — example-header v2.1 (three traps, all cost a publish)

**1. `TextBlock` silently drops `set_text`.** Caught by `wf-preflight` before any MCP write. `TextBlock` is created as a `Block`, which does not own its text node, so it keeps Webflow's own placeholder. Three elements would have shipped as *"This is some text inside of a div block."* — a Rule 14 fail found only after publishing, in the old flow. **Use `Paragraph` (margins zeroed) for a styled text run inside a link/flex parent.**

**2. A source's derived numbers can be wrong; the render cannot.** The spec carried per-span letter-spacing `3.04px` / `13.28px`. Applied as px they compute a 192px line. The reference render measures **111px** ink width (≈5.07-5.22px uniform). Two publishes were spent re-deriving instead of measuring. **Measure text ink extents at intake (`text-extents contract`), then `solve` tracking from one measured point — ink width is linear in letter-spacing.**

**3. A flex column is not the same box as a Figma frame.** The design's brand block is **logo-width** with the name and sub-line overflowing it, centred. Built as a flex column with `align-items:center`, the column sized to its *widest child* (the ~180px sub-line) and centred the 55px logo inside it — moving the whole brand block **+70px right** while every authored property still verified as correct. **When a Figma frame's children are wider than the frame, the frame's width is load-bearing: set it explicitly and let the children overflow.**

**Gate lesson:** at that point the section scored 98.75% PASS / 0 hot regions / a11y PASS / dom-contract 158-of-158 PASS **with a whole text line missing.** A global percentage cannot see a ~10px run in a 1632x117 bar and property equality cannot see an element that renders empty. The anchor eye-view is what caught it; `text-extents bands` (pixel-verify §1.4) is what makes it a number.

**Also confirmed:** `Navbar` remains absent from the `data_element_builder` type enum (`available:false` in skeletons.json) — an API-built header cannot be a real Navbar. `Dropdown` IS available and ships `"Dropdown"` + `"Link 1..3"` placeholders plus an icon-font `Icon`; strip all five per dropdown in the same build pass.

## 2026-08-07 — header build on example-site-design (MCP 2.0.1), three verified platform traps

- **`DropdownLink` is NOT in the `data_element_builder` type enum** (only `Dropdown` is). A Dropdown's own
  three links arrive with the wrapper, but you cannot create more. Native fix: build `LinkBlock` (needs
  children) or `TextLink` (text only) inside the `DropdownList` — they render and the dropdown still toggles
  them natively. Add it to a plan and `wf-preflight` will pass it; the MCP call is what rejects it.
- **`TextBlock` never accepts text — not at creation, not afterwards.** `data_element_builder` silently
  ignores `set_text` on it (element created, no error, default copy retained) and `data_element_tool >
  set_text` answers "This element doesn't support text". Nine panel titles shipped as
  "This is some text inside of a div block." and only the published-HTML Rule 14 sweep caught it.
  **Use `Paragraph` for any text you intend to set**, with `margin-bottom: 0px` on its class.
  Inside a component the element also reports `type: "Block"`, so a `type: "TextBlock"` query finds
  nothing — query by class instead.
- **A CMS item's image `fileId` is NOT a site asset id.** Binding it returns `Asset "<id>" not found`.
  When collections are imported, `fieldData.icon.url` points at the ORIGIN site's CDN path. Re-register the
  file with `create_asset` (md5 of the bytes) — content addressing returns the real id for this site, and if
  the bytes already exist the upload POST is unnecessary (verify with a 200 on the returned hostedUrl).
- **Webflow's dropdown chevron is absolutely positioned right inside the toggle.** With `padding: 0` on the
  toggle it lands ON TOP of the label. Fix natively: a class on the icon-font `Icon` with
  `position: relative; top/right/bottom/left: auto` plus `flex-direction: row-reverse` on the toggle so the
  chevron follows the text. Every automated gate passed while the labels were unreadable — the mandatory
  anchor eye-view is what caught it.

## 2026-08-07 — a fix written against one reference encodes that reference

Three times in one session a fix was scoped to the instance in front of the agent instead of the class:
1. replica mode + the coverage gate went into `url-intake` only — `html-intake` and `design-intake` had zero
   mentions, so a screenshot or HTML delivery could still substitute a reference's content undetected.
2. `url-compile` + `content-coverage` were written, but `wf-section intake` still hard-required `--dcjsx`, so
   nothing could reach them on any other site: the scripts were orphans.
3. `url-compile` keyed class names on the reference's BEM suffix because squarespace.com uses BEM. A Tailwind
   reference collapsed three different containers into one class; a styled-components reference emitted
   `__css-1a2b3c` into the client's site.

The test that catches all three, and it is cheap: **before claiming a fix is general, run it on an input shaped
deliberately unlike the one that prompted it**, and grep whether anything in the pipeline actually CALLS the new
code. Existence is not reachability.

## 2026-08-07 — the footer that cost 68 calls: the pipeline was never invoked

Measured from the transcript (`wf-report --session=`): 155 turns, 68 tool calls, 57 min, peak 321k, 1.4M new
tokens — for one footer. Where the calls went: **18** pack self-audit before any work (`git log`, file-size
census, skills token estimates, playwright probe, `npm install`) · **7** ad-hoc `node -e` one-liners against a
cached extract that `url-compile` reads in one call · **12** scratchpad file writes/patches · **9** post-build
element patches because the plan was incomplete · **3** style batches where the rule says one · **2+**
environment workarounds (`npm install` mid-flight, `NODE_PATH=$(…)`, inline `sleep 20`). ~50 of 68 avoidable.

The structural finding is worse than the count: **no pipeline script ran at all** — no `wf-resolve`, no
`wf-section intake`, no `wf-preflight`, no `record`. The section was built into `covilla-page-design`, a site
with **no state dir**, using `example-site-design`'s ref-cache, and was never recorded — so `build_state` still
says that footer is `in-progress, cost null` on a site where it does not exist, while 69 real links sit live on
another site.

Root cause: every gate in this pack was advisory prose. Prose loses under context pressure. Fixes: `wf-doctor.js`
(step 0) so the environment is never improvised, and `wf-section token` (step 4b) which must PRINT a token —
target locked, spec + plan present, preflight passing right now, inventory present — before any MCP write is
legal. Plus Never entries for `node -e` one-liners and for auditing the pack inside a build session.

## 2026-08-07 — the agent asked for what the reference already answered, and the allowlist never matched

Two separate causes of "I have to approve something every ten seconds".

**Pack-level.** 14 ask-instructions lived in the skills, and most were design decisions: font family, brand
hex codes, assets, what to do about an empty slot, which Interactions-panel wording, whether the user would
confirm in the Designer. In REPLICA mode every one of those is IN the reference, so asking hands the job back.
The worst case is measured: a header build offered a content menu in which no option meant "the reference", the
user picked one, and the build shipped at 1.4%. New `webflow-core § H`: ask ONLY for (1) destroying/overwriting
something the agent did not create, (2) custom code after the descent proof, (3) publishing to a production
custom domain, (4) a credential or paid service. **CMS is inform, not ask.** Everything else: decide at studio
quality, write `assumed:` in the spec, state it in one line, keep building. A question whose options all
abandon the reference IS the bug.

**Harness-level, and this was the real clicking.** `settings.local.json` held 331 allow rules and 249 of them
were EXACT literal commands captured from past sessions (`Bash(node wf-resolve.js --site-id=… --cause="both
mega panels…")`). An exact rule never matches the next command, so every Bash call prompted. Fix has two
halves and neither works alone: prefix rules
(`Bash(node /abs/path/to/scripts/*)`, plus the 3 MCP tools that were genuinely missing), AND `webflow-core § I`
— invoke pack scripts as ONE command with an ABSOLUTE path, never `cd … && node x.js`, never `node $WF/…`,
because a permission rule can only match a literal prefix. 40 Bash calls is 40 approvals the user cannot see
the purpose of; batch them and say what the batch is for.
