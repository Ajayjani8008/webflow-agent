# Webflow GOAT — CHANGELOG

Version history only. Never loaded at runtime (v2.0 moved it out of the always-injected rules dir — it was 2.1k tokens of changelog in every session).

## v2.1.5 — 2026-08-07

The pack shipped a header that matched its reference at **1.4% of strings** while `verify-section`,
`dom-contract` (46/46) and `page-audit` all read PASS. Three defects made that possible; all three are closed.

- **`url-intake` had no REPLICA mode, and its third-party rule fired on source type.** "Reference → Webflow"
  means *rebuild that reference*, but the skill said "third-party → user supplies their own content", so the
  agent offered a menu where every option abandoned the reference and then obeyed it. Mode is now the FIRST
  decision, **REPLICA is the default**, and switching to ADAPT requires the user's own words. What is never
  copied is narrowed to what actually matters: logo/wordmark asset files, trademarks, photography. Text,
  structure, geometry and behaviour ARE the reference.
- **New `content-coverage.js` — the gate no pixel score can replace.** `inventory` pulls every distinct string
  plus a class-group fingerprint out of a url/html capture at intake; `verify` compares the published page
  against it. REPLICA fails below 100% and names the missing strings. Every pre-existing gate compares the
  build against the agent's OWN spec, so substituted content was invisible to all of them — and a pixel score
  cannot see it either, because different words in the right box still fill the box. Wired into the pipeline as
  step 6b. Self-test: 5 cases (complete build passes · substituted content fails · adapt allows it · inventory
  completeness · failure names the strings). Run against the shipped build it reports **2/139 = 1.4% FAIL**.
- **Webflow Dropdown facts are now DATA, not prose** (`skeletons.json > modules.Dropdown.hardFacts`): never set
  `display` on the DropdownList (Webflow's `.w-dropdown-list{display:none}` IS the closed state — overriding it
  renders the panel permanently open) · the wrapper is `position:relative`, so a full-width panel needs the
  wrapper `static` or it resolves against the toggle and clips · the icon-font Icon is absolutely positioned and
  lands on top of the label at `padding:0` · `.w--open` is unreachable from `data_style_tool`, so open-state
  styling is a Designer item. Each of the first three cost exactly one publish on 2026-08-07.
- Added to the Never list: substituting a reference's content when the user asked for a replica · offering the
  user a choice whose every option abandons the reference.
- Still open, and the reason that build cost 204 calls: **there is no `url-compile`.** Figma has
  `figma-parse` -> `figma-compile` -> plan.json + contract; a URL source is hand-authored from the extract every
  time. Next release.

## v2.1.4 — 2026-08-07

Found by building a real section (a mega-menu header) end to end. One gate was failing correct work, one
hole let a content defect reach a publish, and three platform traps are now written down.

- **`verify-section.js` decided "blank shot" from compressed BYTES** (`bytes < 7000`). A legitimately flat
  section — a dark 72px header bar with a wordmark — compresses to 3-4KB, so three correct captures
  (@991/@767/@390) were reported BLANK and the section FAILED. The inverse was worse: a large uniformly
  empty PNG passed. Now measured in pixels: `inkRatio()` finds the modal (background) colour and returns the
  fraction of pixels differing from it; blank = <0.1% ink. Strictly stronger — it catches an empty shot that
  compresses badly, which the byte rule missed. `--self-test` added with three cases, including an explicit
  assertion that the old byte rule would have failed the real bar. Verified on the real captures:
  uniform 0.000% (blank) · real mobile bar 2.215% at 3,569 bytes (not blank).
- **Placeholder sweep moved BEFORE the publish** (`webflow-core` step 5). `wf-preflight` already blocks
  `set_text` on `TextBlock` with the right fix, but only for nodes the plan contains — nine panel titles were
  built from children omitted from `tree`, so nothing checked them and they shipped as "This is some text
  inside of a div block." until the published-HTML Rule 14 sweep caught it, one publish later. Step 5 now
  requires the `allPlaceholderStrings` query plus a read-back of every node whose text was set, and states
  that the plan must list every node to be created.
- **Three verified MCP 2.0.1 traps in `error_learnings.md`:** `DropdownLink` is absent from the
  `data_element_builder` enum (use `LinkBlock`/`TextLink` inside the `DropdownList`) · `TextBlock` never
  accepts text at creation *or* afterwards, and reports as `Block` inside a component so a type query misses
  it · a CMS item's image `fileId` is not a site asset id when collections were imported (re-register via
  `create_asset` with the byte md5).
- No gate, threshold or content rule was loosened. `wf-lint` 0/0.

## v2.1.3 — 2026-08-07

Found by running the pipeline on a real section, not by reading it: `wf-resolve.js` accepted an unknown
flag silently and locked a site with no id.

- `wf-resolve.js` documents `--site-id=<webflow id>`; `wf-section.js` uses `--site=<state dir>`. Passing
  the wrong one is a near-inevitable slip, and the script ignored it, fell back to slug matching, wrote
  `site.site_id: ""` and printed `site_id -` next to an otherwise green `EVIDENCE ... OK`. A later session
  matching on `build_state.site.site_id` finds nothing and seeds a SECOND dir for the same site — the exact
  split-state bug v1.9.1 was written to prevent, reintroduced through the front door.
- Now fail-closed: any unrecognised `--flag` exits 2 with the known-flag list, and `--site` gets a targeted
  hint naming the collision. Two self-test cases cover it (wrong-tool flag, typo'd flag): 17 checks green.
- No gate, threshold or check changed.

## v2.1.2 — 2026-08-07

Two stale dependency paths, found by `wf-lint` during a disk cleanup rather than by reading.

- `pixel-verify` § script root and `session-recovery` § state both named `$WF/package.json`. Deps have
  lived in `$WF/scripts/package.json` since v1.9.0 moved the scripts, so `npm install` at `$WF` created
  a second dead `node_modules` (936KB) and the pack's own path check failed the moment the dead copy
  was removed. Both lines now name `$WF/scripts/package.json`.
- `wf-sync.sh` carried the same wrong path as an explicit pair (`$MEM/package.json` -> `scripts/package.json`),
  which was also redundant: the `scripts/*.json` sweep four lines below already carries it. Pair removed.
- `scripts/package-lock.json` now travels with the pack. "Deps are pinned" was only true of the ranges in
  `package.json`; the lock that fixes the actual versions was never committed, so `wf-sync` reported it
  missing from the repo forever and two machines could resolve different builds of `pixelmatch`/`pngjs`/`ws`.
- No gate, threshold or check changed. `wf-lint` 0/0, `wf-sync` clean except the one intentional
  divergence (`rules/common/agents.md` keeps the Divi site-resolution section the pack drops),
  `pixel-diff.test.js` 5/5 green.

## v2.1.1 — 2026-08-01

Closed the four weak points named after the v2.1 build, each with a check rather than a sentence.

- **check-spec** (`text-extents.js`) — decomposes measured ink into glyph advances + tracking, so a
  source-derived number that cannot fit the render BLOCKS the build. No font metrics needed. The
  shipped kush-header spec implied -27.9px of glyph advance in a 111px line: caught in one call.
- **wf-report.js** — measures a section from the transcript (turns · calls · publishes · peak context
  · new tokens · context re-read · minutes) and `wf-section record` stores it in build_state. The
  budget stops being something recalled and becomes something measured.
- **Call floor cut ~14 -> ~9**: one ToolSearch for the whole MCP surface · `wf-section assets` caches
  the site asset-id map (list_assets is 75KB and blew the response limit twice for seven ids) ·
  predict native-module child ids from skeletons.json instead of read-then-remove-then-append.
- **Block-prefix check enforced**: `wf-preflight --site-prefix= --known-prefixes=` accepts the site id,
  any leading run of its initials and any 3+ char word, and blocks anything else. 48 classes once
  shipped prefixed with a Figma file name.
- **§ G, the two real limits** — an absent mobile frame is UNSCORED plus invariants, never a score;
  Interactions have no API, so a section cannot close on an unapplied panel script.

Tests: 8 suites green, 64+ cases (wf-preflight 20, text-extents 9, wf-report 8 new).

## v2.1 — 2026-08-01

The loop, gated. v2.0 cut the static cost (always-injected 11,700 -> 958 tokens) and every gate fired
correctly on the first real section, but that section still took 6 publishes and 68 calls: the build
targeted the spec's arithmetic instead of the render's measurements, and nothing stopped another
publish after each guess. v2.1 adds the missing measurement and the missing brake.

- `text-extents.js` gains `contract` (reference render -> measured ink extents per text line, at
  INTAKE), `bands` (multi-band ref-vs-built compare, fail-closed, DPR-aware) and `solve` (closes
  tracking in one step from one measured point — ink width is linear in letter-spacing).
- Pipeline step 3b: measure the reference before building. pixel-verify §1.4: the text-extents gate.
- `wf-resolve --publish`: publishes 1-2 free; #3+ refused without `--cause="<new root cause>"`, and a
  repeat of a recorded cause refused outright. `--force` is gone — a guess does not earn a publish.
- `wf-section verify`: records verdict+score; a verify reproducing the previous one prints NO PROGRESS,
  two prints STALLED, where the next step is a measurement and never another fix-and-publish.
- Recorded why: a missing text line scored 98.75% PASS / 0 hot regions / dom-contract 158-of-158 PASS.
  A percentage cannot see a 10px run; property equality cannot see an element that renders empty.

## v2.0 — 2026-08-01
Cost re-architected on measured evidence, gates unchanged or stronger. Full evidence: `v2-rationale.md` (same dir).

---

## Pre-v2.0 (verbatim, from rules/webflow/core.md)

# Webflow Routing (v1.11.0 — GOAT agent system)

ALL Webflow work — any size, any source (Figma / screenshot / HTML / live URL / description) — is handled by the **webflow-goat** agent (`~/.claude/agents/webflow/webflow-goat.md`) or done inline following its rules. It works end-to-end inline: intake → build → pixel-verify → responsive-pass.

- v1.7: HTML/URL references are **behaviour contracts** — every css/js file read in full, the reference RUN headless for hover/scroll/load state shots + a motion fingerprint, per-state parity scored in pixel-verify §1.8. MCP session preamble: `webflow_guide_tool` → explicit site_id → `data_agent_instructions_tool` site rules; components/props/variants are API-buildable (webflow-platform § MCP surface).
- v1.7.1: **code is never the agent's call** — T1→T2→T3 descent proof required in writing, then an explicit per-effect user YES before any html/css/js (canvas/WebGL is *eligible*, not pre-authorized); no answer = native fallback. `/custom-code-once` stays user-invoked only; pixel-verify fails a code hit with no proof or no recorded permission.

- Do NOT use the retired v5 system: no `webflow-builder` spawns, no complexity classifier, no `~/.claude/webflow-kb/` (retired 2026-07-16 → backups; lessons merged into `docs/memory/webflow/error_learnings.md`).
- v1.11.0: **accuracy and token cost stopped being a trade-off — because verification stopped using its eyes.** Measured on a real two-section build: **six image views cost 229,373 tokens = 73% of the whole build**, and the pack's own "a PNG costs ~1-2k tokens" was wrong by 20-60x (real: 5k-66k; 66,328 for one 1920x900 render). Every image rule had been calibrated on that wrong constant. Three new scripts, all local and near-free: **`dom-contract.js`** is now the PRIMARY accuracy gate — computed-CSS property equality against a source-authored contract, catching what a percentage physically cannot (a one-digit hex on small elements, a font fallback, a 1px box delta, a wrong element count) — **`ref-integrity.js`** blocks scoring until reference and capture describe the same box, DPR and backdrop (an isolated Figma node exports on an opaque WHITE canvas, and a header reference that was white where the page is cream still scored "99.11% PASS": the pixel gate is blind to a wrong reference, therefore also to a wrong build) — **`ref-digest.js`** answers Rule 1 (gradient ramps, blur/shadow, overlaps, true text wrap points) in ~0.3s for a few hundred tokens instead of 66k. Image views are capped at ONE per section. Gate order: reference integrity -> property equality -> content/icons/effects -> a11y -> pixels as a coarse safety net. Also settled: a global pixel score can never reach 100% (Figma vs Chrome glyph rasterisation — 3,127 of 3,719 deviating pixels sat on glyph edges), so the target is 100% property equality + zero flat-area deviations, NOT a percentage.
- v1.10.0: **token cost fixed at the root, accuracy held constant.** A slider section had cost ~197k: the cause is that every tool result is re-sent with every later call, so **N calls cost ~N²/2** — not instruction size (~33k once) and not payloads. Fixes, all accuracy-neutral or better: **ONE `verify-section.js` call** returns every breakpoint shot + every strict score + a11y/perf + states (replaces ~12 calls, same thresholds) · **one section per session** with the intake spec now WRITTEN to `sites/<id>/specs/<section>.md`, so a cold session resumes with zero history (also survives a crash, and pixel-verify diffs the written contract instead of a recollection) · **image discipline** — reference render always, one anchor compare, then only FAILED/UNSCORED shots, because a PASS is measured more strictly than an eye · **read narrow** (no `depth -1`, no page-root metadata) · **auto-skeleton recipe** for Slider/Tabs/Navbar/Dropdown/Form (create bare → ONE subtree read → ONE style batch → ONE settings batch → ONE builder call; never re-read the subtree) · **cost checkpoint** at ~60k, stop-and-ask at ~100k — a report, never permission to leave a diff open. No gate was loosened: 197k → ~50-70k target with the strict v1.9.0 gates intact.
- v1.9.1: **`<site-id>` is derived, never invented** — resolve by matching `build_state.site.site_id` under `$WF/sites/`, else the site's shortName/slug from `data_sites_tool`, then seed from `sites/_template/` and write `site.*` immediately (session-recovery step 0). A guessed folder name splits one site's state across two dirs, neither complete. Also: the pre-v1.9.0 layout (stub registry, un-scoped ledger, OLD permissive `pixel-diff.js`) removed from the repo so a restore can't reinstall the fixed bugs — the 17 real Designer items preserved under `docs-memory/sites/hive-pro-blog/`; `wf-sync.sh` now carries tracked sites' three state files (never caches); lint baseline re-cut at 0/0; `webflow-help` updated with the strict gates, the a11y gate, per-site state and the two self-serve health checks.
- v1.9.0: **evidence layer built + gates made fail-closed.** State is **per site** — `$WF/sites/<site-id>/{registry.md,build_state.json,pending_designer_work.md,figma-cache,ref-cache}`, shared `impossible_cases.md`/`error_learnings.md`/`scripts/` at `$WF` (`WF="$HOME/docs/memory/webflow"`); registry template carries all 12 sections the rules grep, build_state schema exists, another site's pending items can no longer block this build. Scripts moved to `$WF/scripts/` with pinned deps (`npm install`, never `--no-save`) so verification runs from any directory. `pixel-diff` now fails on **height delta >2%** and **any 12×12 cell >25% mismatched**, not just <97% global (both holes proven by `pixel-diff.test.js`, 5 cases). New `page-audit.js` = scored a11y+perf gate (pixel-verify §1.9). Reports must paste the tool's verbatim `EVIDENCE` block · STALLED illegal with a CRITICAL/MAJOR diff open · LIGHT depth must show its checklist · `reference-not-run` needs the command, the error and a served retry · state-shot names unhovered elements as `unverifiedStates` · snapshot required before any destroy · hybrid sources legal when roles are declared · Rule 17 never overrides a source. Validator: `node "$WF/scripts/wf-lint.js"`.
- v1.8.2: **no toy builds — Rule 17.** A thin brief ("build X", "animate the cards") is the floor, not the ceiling: infer the top-tier professional version, ASSUME → STATE in one line → BUILD, never stall on questions the agent can answer itself (durations, easing, stagger, depth, states). Native is the unspoken default — "make it premium" is a demand for a stronger native build, never permission for code. Ambition = depth of what was asked, never extra scope. Toy tells fail a build; motion intent table in `motion-build` § Under-specified brief, static one in `build-reference` § No-toy default.
- v1.8.1: **one MCP path, old spec or new — never branch on protocol version.** Spec `2025-11-25`→`2026-07-28` adoption is staggered (server version `2.0.1` is a different number), so the rules are written true on both: preamble re-runs on reconnect/site-switch/tool-list change · read-back is evidence only if post-write + fresh (pixel-verify §1) · `InputRequiredResult` = retry with `inputResponses`, never auto-answer a permission prompt · `-32002` and `-32602` get the same fix · re-read a tool schema on validation error · store task ids · never depend on roots/sampling/logging · MCP App HTML is client UI, never build output.
- v1.8.0: **TASK LANES first** — T0 micro-edit (no skills, read-back proof only) · T1 section · T2 page · T3 debug · T4 inspect. Load per lane, never by habit.
- Skills (lazy, one per need): design-intake (Figma/screenshot) · html-intake (HTML delivery) · url-intake (live URL ONLY) · figma-setup · build-reference (what to build) · webflow-platform (MCP surface, limits, errors — on demand) · component-build (repeats ≥2×) · cms-build (editorial ≥3×) · motion-build (animation) · pixel-verify · responsive-pass · portable-mode · session-recovery · custom-code-once (user-only) · webflow-help. Source isolation: never load the other source's skill/cache.
- Project memory: `docs/memory/webflow/` — registry.md (single file, grep sections) · build_state.json · pending_designer_work.md (17+ open items — surface before claiming done) · impossible_cases.md · error_learnings.md.
