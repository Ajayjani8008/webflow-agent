# Webflow GOAT — CHANGELOG

Version history only. Never loaded at runtime (v2.0 moved it out of the always-injected rules dir — it was 2.1k tokens of changelog in every session).

## v2.1.13 — 2026-08-07

"I have to approve something every ten seconds, I cannot see what for, and refusing derails the build."
Two unrelated causes, both measured.

**1. The agent asked for what the reference already answered.** 14 ask-instructions lived in the skills and
most were design decisions: font family, brand hex codes, assets, empty-slot handling, Interactions-panel
wording, "ask the user to confirm in Designer". In REPLICA mode every one of those is IN the source, so asking
hands the job back to the person who delegated it — and the worst case is measured: a header build offered a
content menu in which no option meant "the reference", and shipped at 1.4%.

New **`webflow-core § H — ASK ALMOST NEVER`**. The complete list of what is worth interrupting a human for:
destroying or overwriting something the agent did not create · custom code after the written descent proof ·
publishing to a production custom domain · a credential or paid service. **CMS is INFORM, not ask** — creating
a collection/field/items to make the reference work is part of the build; only deleting or overwriting existing
data is an ask. Everything else: **DECIDE → STATE IN ONE LINE → CONTINUE**, with `assumed:` in the spec.
And: never ask a question whose options all abandon the reference — the question is the bug.
De-asked at source: `design-intake` (fonts/colours/assets/empty slots), `url-intake` (font install, inline SVG,
and item 10, which still said "third-party reference → user supplies real content" — the exact sentence behind
the 1.4% build), `motion-build` (panel labels: emit with canonical labels marked `labels:unverified`, correct
only if the user reports a mismatch), `pixel-verify` (human confirmation is now last resort, never a substitute
for a measurement).

**2. The permission allowlist never matched anything.** `settings.local.json` held 331 allow rules, and 249 were
EXACT literal commands captured from past sessions — `Bash(node wf-resolve.js --site-id=… --cause="both mega
panels…")`. An exact rule cannot match the next command, so **every Bash call prompted**. Three MCP tools the
pipeline calls were also genuinely absent. Fixed in two halves, because neither works alone:
- `~/.claude/settings.json` gains intentional **prefix** rules — `Bash(node <abs>/scripts/*)`,
  `Bash(bash <abs>/scripts/*)` — plus `data_element_settings_tool`, `data_component_builder`,
  `data_component_props_tool`, `data_component_variants_tool`, `asset_tool`, `get_asset_preview`.
  Nothing replaced; the existing keys and the 331 rules are untouched.
- New **`webflow-core § I — command shape`**: invoke pack scripts as ONE command with an ABSOLUTE path.
  `cd $WF/scripts && node x.js` and `node $WF/scripts/x.js` both MISS a prefix rule, and that is how nearly
  every call in the 2026-08-07 sessions was shaped. Resolve the absolute path once per session and reuse it.
  Batch shell work: 40 Bash calls is 40 approvals whose purpose the user cannot see.

`wf-lint` 0/0. Not touched: the code-permission rule (the user's standing rule) and the
destroy-needs-a-snapshot rule — those asks are the four that remain legitimate.

## v2.1.12 — 2026-08-07

The screenshot source compiles. No hand work left on any reference type.

`figma -> figma-compile`, `url/html -> url-compile`, `screenshot -> nothing` was the last asymmetry: the one
source with no machine capture was the one where the plan, the values AND the string inventory were all
hand-authored — the exact condition that produced a 204-call, 1.4%-accurate header.

**`shot-compile.js`** — a PNG has no DOM, but it is not opaque:
- **Strings come from real OCR, with boxes.** macOS Vision via a 40-line Swift helper (`wf-ocr.swift`)
  compiled on demand into `scripts/.cache/` — nothing to install, no network. `tesseract` is the portable
  fallback; without either it refuses and says asking for a URL/HTML reference is better input anyway.
  Measured on a real header shot: 6/6 runs at **confidence 1.00**.
- **Values come from pixels.** Text colour sampled from its own ink against its local background · page
  background as the modal colour · padding from ink extents · gaps from the within-row rhythm · **filled
  buttons detected** because a pill's local background differs from the page's (found the CTA correctly).
- **Structure from geometry.** Runs cluster into rows by baseline overlap, then into groups by gap. The gap
  base is the **25th percentile, never the median** — with three clusters the median gap IS a between-cluster
  gap, so a median-based cut exceeded every real gap and never split the row (its own self-test caught that).
  On the real header it recovers exactly the reference's three clusters: brand | 3 nav items | login + CTA.
- **OCR artefacts handled structurally, not by a glyph list.** Vision returned `"V"` for one chevron and the
  CJK `"く"` for the next one in the same image, so enumerating glyphs is hopeless: a trailing
  single-character token in a UI label is an icon (digits kept, so "Step 2" survives), and a 1-2 char leading
  token before a long word is a logo mark. Every strip is printed, never silent.
- **Provenance is emitted with the plan**: what was MEASURED, what is ESTIMATED (font size, ±1px from
  cap-height — so step 3c `text-extents check-spec` is mandatory for this source), and what is NOT KNOWABLE
  (font family; and states, which a still cannot contain — behaviour parity must never be claimed from an image).
- It writes its own **content inventory**, so step 6b guards a screenshot build like any other.

Wired: `wf-section intake --screenshot=<png>` is the third branch of the one intake command · `wf-doctor`
checks OCR readiness so a build never discovers it mid-flight · `webflow-core` source table updated.
9 self-tests. The generated plan preflights **CLEAN** on a real screenshot.

## v2.1.11 — 2026-08-07

Two ways a wrong build could still pass every gate. Both closed, both with the failing case as a test.

- **`verify-section` printed `PASS` while scoring nothing.** A missing `--ref` was a *warning*; the verdict was
  computed only from failures, so "PASS … shots captured but NOT scored" was printable — and that is the exact
  line that accompanied a header matching its reference at 1.4%. Now: no reference means verdict
  **UNVERIFIED** (exit 1), and a per-width UNSCORED must be **declared** — `--unscored-ok=<widths>
  --unscored-reason="<why the source has no frame>"` — so Rule G's legitimate case stays legitimate while
  silence becomes a failure. `PASS` is now impossible unless something was actually measured.
- **Nothing compared the build against its plan.** Every gate verifies what EXISTS: property equality checks
  the classes you created, the pixel score compares the region you captured, a11y walks the DOM you shipped.
  A build that is a SUBSET of its plan passes all of them. New **`plan-diff.js`** compares the compiled plan to
  the published markup — classes, strings, and a per-tag structural deficit. Run against the live page with the
  582-node replica plan it reports: **classes 3/111 (2.7%) · strings 2/138 (1.4%) · `<div>` plan 238 built 25 ·
  `<a>` plan 120 built 16**. Surplus wrappers (Webflow adds its own) never fail it; only a deficit does.
  6 self-tests including a subset build, and the failure names the missing classes and strings.
- **`wf-section verify` now auto-discovers the reference shots** (ref-cache/*/shots, figma-cache screenshots)
  and chains `verify-section → dom-contract → plan-diff`. The flag that was easiest to forget is no longer the
  one holding the accuracy gate up.
- Pipeline gains step 6c; the Never list gains "calling a section verified when nothing was scored".

## v2.1.10 — 2026-08-07

Audited v2.1.3-v2.1.9 against the actual goal — **any reference (Figma / live URL / HTML / React app /
screenshot) → native Webflow, on any site** — instead of against the site that surfaced the bugs. The logic
held; three source-specific gaps and one unproven claim did not.

- **The content gate was URL/HTML-only, so Figma copy could be substituted undetected.** `figma-parse` emits
  `nodes[].text` and `content-coverage` already reads that shape — it was simply never wired. Now `intake`
  writes an inventory for **figma too**, and `token` requires one for **every** source. A screenshot has no
  machine capture, so it is told to TRANSCRIBE its strings into the same file rather than being exempted:
  the one source without a gate is the one where substituted content ships.
- **The HTML route was asserted, not proven.** `ref-extract` contains no mention of `file://`. Verified
  end-to-end on a local delivery: `file://…/index.html` → `ref-extract` (6 nodes) → `url-compile`
  (5 classes, 4 strings) → inventory → `wf-preflight` **CLEAN**. The claim now stands on a run.
- **React / Vue / SPA / Storybook named as a first-class route** — it is a live URL (localhost or deployed);
  hashed and utility class names are expected and already handled since v2.1.8, because class identity comes
  from role + style fingerprint rather than the framework's generated names.
- **Test fixtures renamed off the debug sites** (`site-nav__*`, `acme-header`, `example-site-design`,
  `ACMEWORKS`). A fixture named after a test site reads like a target, which is how "the agent is built for one
  site" becomes true by accident.
- One assertion was passing by accident: the fluid-width case had no bare-px container in its fixture. Fixture
  fixed so the rule is actually exercised. 24 url-compile · 19 wf-section · 13 wf-preflight · 5
  content-coverage · 6 wf-doctor cases green; `wf-lint` 0/0.

## v2.1.9 — 2026-08-07

Diagnosed the footer that cost 68 calls and 57 minutes. The count was not the finding: **no pipeline script
ran at all.**

Measured (`wf-report --session=`): 155 turns · 68 calls · 57 min · peak 321k · 1.4M new tokens, for one footer.
Call budget: **18** pack self-audit before any work (`git log`, file-size census, skills token estimates,
playwright probe, `npm install`) · **7** ad-hoc `node -e` one-liners against a cached extract that `url-compile`
reads in ONE call · **12** scratchpad write/patch cycles · **9** post-build element patches because the plan was
incomplete · **3** style batches where the rule says one · **2+** environment workarounds. ~50 of 68 avoidable.

And the state layer was bypassed entirely: the footer was built into `covilla-page-design`, a site with **no
state dir**, using another site's `ref-cache`, and never recorded — so `build_state` claims that footer is
`in-progress, cost null` on a site where it does not exist, while 69 real links sit live somewhere else.

Root cause: **every gate was advisory prose, and prose loses under context pressure.** Two mechanical gates:

- **`wf-doctor.js` (pipeline step 0, once per session)** — pipeline scripts present · node deps resolvable FROM
  the scripts dir (the thing `NODE_PATH=$(…)` prefixes were papering over) · headless Chrome · state root · and
  **state drift**: any section marked `in-progress` with no recorded cost, meaning it was either never built or
  built and never recorded. First run on the live install found both real drifts immediately.
- **`wf-section token` (step 4b)** — readiness must be PRODUCED, not assumed. Prints `BUILD-TOKEN` only when the
  site_id and page are locked, the spec and plan exist, **preflight passes right now**, and (url/html) the
  content inventory exists. `webflow-core`: no `data_element_builder` or `data_style_tool` write is legal without
  a fresh token line for that section. 6 new self-tests (18 total in `wf-section`).
- Never list gained the two habits that ate 25 calls: an ad-hoc `node -e` against a cache or capture (if a named
  script cannot answer it, add a **flag** to that script — a one-liner is thrown away and paid for again next
  session), and auditing or refactoring the pack inside a build session.

## v2.1.8 — 2026-08-07

`url-compile` was written against ONE reference site's conventions. Caught by the user, proven with two
non-Squarespace references, fixed at the root.

The compiler took its class names from the reference's BEM suffix, because squarespace.com uses BEM. On a
**utility-class reference** (Tailwind) the bar, the nav group and the actions group all carry `flex`, so all
three collapsed into a single `__flex` class — styling the bar restyled the nav and the buttons. On a
**hashed reference** (styled-components / CSS modules) it emitted `site-header__css-1a2b3c`, baking a build
tool's throwaway names permanently into the client's site. Most modern reference sites are one of those two.

- **Class IDENTITY is now `(tag + element role + authored-style fingerprint)`** — never the reference's class
  string. Two nodes share a class only when they are the same kind of thing AND look the same. A semantic
  reference still collapses to a few dozen shared classes; a utility reference no longer merges unrelated
  containers. Squarespace's header went 73 -> 111 classes because elements that merely shared a BEM *name*
  while looking different are no longer silently merged: the same defect, previously invisible.
- **Naming style is detected per capture and reported** — `semantic` / `utility` / `opaque` / `none`. Semantic
  references keep their readable suffixes; everything else gets **role-derived** names (`__row`, `__col`,
  `__nav`, `__title`, `__eyebrow`, `__icon`, `__image`, `__link`, `__link-block`, `__list-item`), where the
  role comes from tag, layout direction, media size and font-size rank — facts every reference has.
- 6 new self-tests on deliberately non-BEM fixtures: containers do not collapse · no utility token becomes a
  class name · names are roles · no build-generated name leaks · role names stay readable · the style is
  detected rather than assumed. 23 cases total, and the Squarespace path still preflights **PASS, 0 blockers**.

The general lesson, recorded because it recurred three times today: a fix written while looking at one
reference tends to encode that reference. The check is to run it against inputs shaped differently on purpose.

## v2.1.7 — 2026-08-07

v2.1.5 and v2.1.6 fixed the INSTANCE, not the CLASS. The user was right to call it out: the new capability
was unreachable on any other site or reference.

- **`wf-section.js intake` — pipeline step 2, the command actually invoked — hard-required `--dcjsx` and died
  without it.** It was Figma-only, so `url-compile` and `content-coverage` were orphan scripts: on the next
  site, with a URL or HTML reference, intake refuses to run and the agent falls back to hand-authoring — the
  exact behaviour that cost 204 calls. Intake is now **source-agnostic**: `--dcjsx` (figma -> figma-parse ->
  figma-compile) or `--extract` (url/html -> url-compile -> content inventory), then `wf-preflight` either way.
  One source only; passing both is refused; passing neither names both paths. `--mode` defaults to `replica`.
  Also forwards `--site-prefix`/`--known-prefixes` so the block-prefix check is actually on.
- **Replica-vs-adapt and the coverage gate now live in EVERY intake skill, not just `url-intake`.**
  `html-intake` had 0 mentions and `design-intake` (figma + screenshot) had 0 — so a screenshot or an HTML
  delivery could still silently substitute a reference's content and no gate would notice. All four sources
  now carry the same mode decision and the same inventory step.
- **HTML deliveries share the compiler**: capture the delivery through `ref-extract` on a `file://` URL and it
  is the same one intake call. Screenshots are named as the one source with no machine capture, so the spec
  must transcribe every visible string and check it by eye — stated instead of silently absent.
- 8 new `wf-section` self-tests (12 total): url/html compiles through intake · inventory written · replica is
  the default · both-sources refused · no-source names both paths.

## v2.1.6 — 2026-08-07

`url-compile.js` — the missing half of `url-intake`, and the fix for the 204-call header.

Figma sources compile (`figma-parse` -> `figma-compile` -> plan + contract). A URL source was hand-authored
from the extract every time, which is why one header cost 204 tool calls, 5 publishes and shipped at 1.4%
coverage. The extract was never the problem: nothing read it.

`url-compile <extract.json> --prefix=<block> [--font=X]` emits a preflight-clean `plan.json` + a
`dom-contract` contract straight from the reference's own captured values. On the cached squarespace.com
header: **586 nodes -> 582 planned, 73 shared classes, 209 strings carried, 15 assets flagged**, and
`wf-preflight` **PASS, 0 blockers**. Hand-authoring produced 20 strings from the same file.

Every trap this pack has already paid for is compiled in, not left to the builder to remember:
- text never lands on `TextBlock` (Paragraph/Heading/TextLink/LinkBlock/Button); `<a>` with children -> LinkBlock
- shorthands expanded, including **`transition`** with paren-aware splitting so `cubic-bezier(0.165, 0.84, 0.44, 1)`
  survives (25 preflight blockers on the first run — caught before a single MCP call)
- Rule 15: every image class gets `flex-shrink:0` + an explicit box from the captured geometry
- Rule 7 fluid base: a captured px width becomes `width:100%` + `max-width:<px>`; bare px only on intrinsic media
- Rule 4: a class named after a native module is checked against behaviour — repeated equal-size siblings mean
  BUILD THE MODULE (reported as NATIVE MODULE REQUIRED); a statically-rendering one is renamed truthfully and
  the rename is printed, never silently
- layout results are not authored values: fractional widths on text nodes dropped, kept for icon-sized media
- proprietary font families substituted once, explicitly, and reported

17 self-test cases. Two bugs found by its own EVIDENCE line during development: a duplicated `childrenOf`
population exploded the tree to 1.4M nodes, and an over-broad `icon|logo` regex kept a 208px wrapper's
measured width.

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
