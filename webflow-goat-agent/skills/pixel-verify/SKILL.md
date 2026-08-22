---
name: pixel-verify
description: Mandatory verification loop after building each Webflow section — tier auto-selected (LIGHT/FULL), automated screenshot capture, DOM read-back, property diff against the intake spec, visual compare, per-state behaviour parity (hover/scroll/load vs the reference), one batched fix pass. A section is not done until this passes. This is the accuracy engine.
---

# Pixel Verify

Run after every section build, before responsive-pass. Never skipped. **Goal: the built section is visually indistinguishable from the reference, side by side — converge to ZERO visual diffs, don't stop early.** Automated comparison = primary evidence.

**CONVERGENCE, NOT A FIXED CAP.** Fix passes continue as long as each pass closes ≥1 diff. Stop ONLY when: zero visual diffs (PASS), or remaining diffs are documented impossible cases, or 2 consecutive passes close nothing (STALLED → report each remaining diff + exact reason + what would resolve it). Declaring done with visible diffs = failure; the user must never have to say "retry" or "force match". Waste = re-verifying what already passed — each pass re-checks ONLY open diffs + neighbors, never the full section again.

## T. Depth selection (property diff only — visual compare is NEVER reduced)

**Side-by-side visual compare against the reference runs for EVERY section, both tiers, no exceptions.** Only the property-diff table depth varies:
**LIGHT is a claim you must show, not a mood (v1.9.0):** choosing it means writing the qualifying line in the report — `depth: LIGHT (elements 6 ≤8 · gradients 0 · absolute/sticky 0 · native modules none · flex simple · shadow layers 1)`. Any condition unmet, any doubt, or any visual diff at all → **FULL**, no negotiation. Section 1, heroes, forms/sliders/tabs/navbar and anything the user flagged are FULL by definition.

- **LIGHT** (ALL true: ≤8 elements · no gradients · no absolute/sticky · no form/slider/tabs/navbar · simple flex · no multi-layer shadows): spot-check per class — `display`/`flex-direction` · `grid-column-gap`/`grid-row-gap` · `padding-top`/`padding-bottom` · `font-size` · `font-weight` · `color` · `background-color` · width strategy. Any fail OR any visual diff → escalate to FULL.
- **FULL** otherwise, and always for section 1, heroes, anything user flagged.

## 0. Screenshot capture

1. `element_snapshot_tool` on built section. 2. Reference: Figma `get_screenshot` (from cache) or original image. Both must exist — no screenshots = blind.

**`element_snapshot_tool` DOES NOT LOAD CUSTOM WEB FONTS (verified 2026-07-12).** Custom fonts render as serif fallback — mangled-Times H1 = snapshot artifact, NOT a bug. Before "fixing" a font mismatch: confirm font installed (`data_fonts_tool`) + class `font-family` correct — both right = tool lying. **Never restyle typography off the snapshot.** Typography + anything font-metric-dependent (wrapping, line count, overflow) → verify against PUBLISHED page only.

**PUBLISH ONCE, THEN AT MOST ONE VERIFICATION RE-PUBLISH (v1.9.0).** Publishing = slow + token cost. Interim checks = `element_snapshot_tool` (no publish needed — but it returns an IMAGE, so it is free of *publishing*, not free of tokens: use it when you need to SEE something, and a text read-back when you need to know a value). Batch ALL fixes → publish once, then in ONE browser session capture: final typography shot · behaviour-parity states (§1.8 `state-shot.js`) · motion fingerprint (`motion-verify.js all`) · a11y/perf audit (§1.9) · every breakpoint shot responsive-pass §6 needs. Score them together.
That combined pass finds real defects → fix them in ONE batch → **one verification re-publish is allowed and expected**, capped at **2 publishes per section**, counted in the report and in `build_state.sections[].publishes`. Convergence outranks publish-thrift: never accept a visible defect because "we already published". What stays a process bug is publishing *per artifact* — one publish for the mobile shots, another for the hover shots. A 3rd publish means something is being fixed blind: stop, read the actual state, then fix.

**Script root, resolved once per session:** `WF="$HOME/docs/memory/webflow"` — every verification command is `node "$WF/scripts/<name>.js" …`, so it runs from any working directory (v1.9.0). Deps are pinned in `$WF/scripts/package.json` → `npm install` in `$WF/scripts`; never `npm i --no-save`, which prunes the others.

### ONE CALL FOR THE WHOLE EVIDENCE SET (v1.10.0 — use this, not the individual scripts)

```
node "$WF/scripts/verify-section.js" <published-url> "<builtSel>" <outDir> \
     --section=<name> --widths=<REF-FRAME-W>,991,767,390 --ref=<reference-shot-dir> --audit [--states=base,auto,scroll:40]
```

**A clean score is `PASS-PENDING-ANCHOR`, not `PASS`.** `verify-section` withholds the PASS verdict (and exits 1) until `--anchor-seen="<what the side-by-side showed>"` records the anchor view. That is not ceremony: **no script can see a render.** The differ compares pixels, `dom-contract` compares properties, `plan-diff` compares inventories — and all three were green on a section with a whole text line missing (98.75%, zero hot regions, 158/158). Describe what you SAW; if the anchor revealed a diff, fix it and re-verify rather than passing the flag to move on.

**The first `--widths` entry is the reference frame's own width, not the 1440 default.** Read it off the reference PNG (`ref-integrity.js` reports it) and pass it. A 1920-authored frame scored against a 1440 capture is comparing the design to a reflow of the build the design never described — the score drifts, real diffs get masked and false ones get invented. Use 1440 only when the reference frame is 1440. The 991/767/390 tail stays fixed: those are Webflow's own breakpoint tiers.

Every breakpoint shot (one browser launch, reload per width), every pixel-diff against its reference frame, the a11y/perf audit at desktop + phone, and the interaction states — **one tool call, one consolidated `EVIDENCE verify-section` block, one JSON.** Same scripts, same strict thresholds, same fail-closed verdicts underneath; nothing about accuracy changes.

**Why this is mandatory, not a convenience:** in a conversation every tool result is re-sent with every later call, so **call count is what compounds token cost, not output size**. The 12-call version of this pass cost multiples of the 1-call version for identical evidence. Reach for the individual scripts (`shot-el`, `pixel-diff`, `page-audit`, `state-shot`) only for a single targeted re-check inside a fix pass — never to assemble a full pass by hand.

Verdict handling: `PASS` = every width scored, height within tolerance, no hot region, audit clean, no blank capture, no overflow. `UNSCORED` on a width means **no reference frame existed** — that is not a pass; say so in the report and name the derived values. `FAIL` names the width, the reason and the exact hot-region boxes to fix.

**Individual scripts (fix passes + special cases):** `shot-el.js <url> <out.png> <W> "<sel>" <mobile:1|0> <port>` (unique port per run).

**Interaction states:** `node "$WF/scripts/state-shot.js" <url> <outPrefix> <W> "<sel>" "base,auto,scroll:40,click:.tab" <mobile> <port>` — resting + hover + focus + click + scrolled shots in one browser launch, on a published URL or a `file://` reference. Required for §1.8; `pixel-diff.js` scores each matched pair. `auto` hovers up to 6 interactive descendants; **`auto:N` raises the cap, and everything past it returns as `unverifiedStates` + a stderr WARN. An unhovered interactive element is an UNVERIFIED state, never an absent one** — raise the cap, name it with `hover:<sel>`, or list it as unverified in the report. Ignoring the warning silently = failed gate.
- **Clip to element's bounding box, NOT `{x:0,y:0}`** — CDP clip is PAGE-origin; fixed `y:0` captures blank page top. ~5-6KB PNG = blank capture → wrong clip or unpublished/opacity-hidden page.
- **Mobile: `--window-size` does NOT set layout viewport** — script uses CDP `Emulation.setDeviceMetricsOverride {mobile:true, deviceScaleFactor:2}` + ws header `Origin: http://localhost` + ABSOLUTE `--user-data-dir`. See [[webflow-mcp-gotchas]].

**Compare scan order:** proportions → layout grid → spacing rhythm → alignment edges → type hierarchy → color blocks → radii → shadows → asset crops. Quantify + locate mismatches ("hero__title 10px lower than reference").

## 0.5 REFERENCE-INTEGRITY GATE — run BEFORE any score exists (v1.11.0, blocking)

`node "$WF/scripts/ref-integrity.js" check <ref.png> <capture.png> [--bg=#RRGGBB]`
Exit 0 comparable - 1 NOT comparable - 2 IO. **A score computed on a non-comparable pair is not evidence, it is noise.** Never report a percentage until this exits 0.

Three defects it catches, all measured on real builds:
- **wrong backdrop** - `get_screenshot`/`download_assets` on an isolated node renders it on an opaque **white** canvas (0 transparent px) even when the node is a transparent overlay. A real header reference was white where the page is `#FDF9EA`: **83% of pixels differed and pixelmatch still returned "99.11% PASS"**. Re-scored against a correct reference: **99.10%** - i.e. the pixel gate was *completely blind* to a wrong backdrop, so it will also pass a wrong BUILD. This is the single strongest reason property equality (§1.0) outranks pixels.
- **wrong box** - scoring a 1920-wide capture against a 1632-wide reference makes pixel-diff upscale the reference 1.18x and invent a "16.1% height delta" plus six right-edge hot regions on a sound build. Cost two verification runs and a publish. A right-edge hot-region cluster + a large height delta is the *signature* of a width mismatch, not a layout bug.
- **degenerate reference** - a Figma mask group can export as a **1x1** PNG (149 bytes). Check dimensions before treating an export as an asset.

Fixing a reference, in order of preference:
1. `ref-integrity.js crop <parentFrame.png> <out> <x> <y> <w> <h>` - cut the section out of its PARENT frame render so the true backdrop travels with it. **This is the correct source of truth.**
2. `ref-integrity.js compose <node.png> <out> <frameW> <frameH> <x> <y> --bg=#RRGGBB --drop-canvas` - fallback for an isolated export; `--drop-canvas` flood-fills the border-touching canvas colour away from the edges so interior white artwork survives.

## 1.0 PROPERTY-EQUALITY GATE — the PRIMARY accuracy gate (v1.11.0)

`node "$WF/scripts/dom-contract.js" verify <url> <specs/<section>.contract.json> --width=1920`
Exit 0 only if **every** expected property equals the contract. Paste the `EVIDENCE dom-contract` line verbatim.

**Why this outranks the pixel score.** A percentage cannot see a wrong value that covers little area, and it can never reach 100% even on a perfect build, because Figma and Chrome rasterise glyphs differently - measured, of 3,719 strongly-deviating pixels in a PASSing header, **3,127 sat on glyph edges** and the rest were a reference artifact. So chasing "99.99% pixels" spends tokens on antialiasing noise. Property equality is the reachable, meaningful target, and it is the **cheapest gate that exists** - it reads numbers, never images.

Proven to catch, in one negative test, what pixels cannot:
`background-color #835E2D vs #835E2C` (one hex digit, four small circles) - `letter-spacing 7.93px vs 13.28px` - a **font fallback** (`resolved to "Yrsa, sans-serif" - expected "Inter" first`) - `count: 5 elements, expected 7` - `box.h 1 != 2`.

The contract is authored from the SOURCE (Figma/HTML values), never from the built page. **Status: hand-authored today, which is a known weakness** — hand transcription is exactly what produced the letter-spacing and flex-vs-absolute defects this gate exists to catch, and it does not scale to a 14-section page. Generating the contract from the cached node data is the next step; until then, treat a hand-written contract as a second pair of eyes on your own transcription, not as independent truth - a contract emitted from your own build only proves the build equals itself. `dom-contract.js emit <url> <rootSel> <out.json>` exists to bootstrap the selector list and to catch later regressions; replace its values with source values before using it as a gate.

Gate order is now: **0.5 reference integrity -> 1.0 property equality -> 1.5/1.6/1.7 content, icons, effects -> 1.9 a11y -> 3 visual compare (coarse safety net).** A section with a green pixel score and a red property diff is NOT done.

## 1. Structure read-back (evidence, not attestation)

**POST-BATCH COUNT CHECK — after EVERY `data_element_builder` call, not just final verify.** Builder can silently duplicate a whole subtree (slow/retried bridge call → second content block, contiguous ids). Query direct-child count (depth 1-2) = what you built; duplicate/orphan → `remove_element` NOW, before styling.

MCP: `element_snapshot_tool` / `data_element_tool` get. API: `GET /v2/pages/{id}/dom`.

**FRESH-READ RULE (applies to every server — no version check).** Read/list results can be cached, so a read-back can show pre-edit state and pass a gate on work that never landed. Every read used as done-evidence must be issued AFTER the write and must not be a byte-identical repeat of the pre-edit read of the same target — if it is, re-issue with a different query shape (`query_elements` on the touched ids rather than the cached subtree) before scoring. Verdict from a stale read = no verdict, in either direction (don't rebuild on a stale "missing" either).

Check vs spec:
- [ ] Every spec element exists, right node type (h-level, paragraph, image, link-block, native slider/tabs/form…)
- [ ] Planned classes present (combo = base + modifier)
- [ ] Text = exact copy, character-for-character
- [ ] Images point at uploaded asset URLs + real alt
- [ ] Nesting, count, order match spec — no extra wrappers, no orphans

**Ban-compliance sweep (instant FAIL — rebuild natively, both tiers):**
- [ ] Zero html-embed / HtmlEmbed / CodeBlock
- [ ] Zero `<style>` / `<script>` / inline `style=`
- [ ] **`xattr` carries NO CSS** — any CSS-named custom property (incl. `margin: 0px` resets) = void; belongs on a class. Attributes = semantics only
- [ ] Built via `data_element_builder`, not `data_whtml_builder`
- [ ] No data-* attributes for styling

Any hit = build void regardless of visual match. Delete, rebuild native, restart verify. **Whitelist (exact match only, never "similar") — every entry needs BOTH a descent proof and a recorded user yes:** ① snippet logged in registry.md `## Custom-Code-Exceptions` via **user-invoked** `/custom-code-once` ② a **T4 effect from the intake manifest** (canvas/WebGL only, per build-reference § Effect Fidelity Ladder T4) whose registry entry carries the `T1/T2/T3 why-not` proof **and the user's verbatim authorization + date**. Instant FAIL: a T4 hit not in the manifest · no registry entry · registry entry without the proof line · registry entry without a recorded permission (agent self-authorized) · permission inherited from another effect, another section or an earlier session · any code carrying layout/spacing/typography/color/hover CSS. "The user said preserve the effects" is context, never permission for a specific snippet.

## 1.4 TEXT-EXTENTS GATE — every text line measured, not eyeballed (v2.1, blocking)

```
node "$WF/scripts/text-extents.js" bands <ref.png> <built.png> \
     --bands=<label>:<y0>:<y1>,… [--ref-xoff=N] [--built-xoff=N] [--built-scale=2] [--tol=1.5]
```

**Why this gate exists, measured on kush-header (2026-08-01):** a missing text line scored **98.75% PASS with zero hot regions**. A ~10px-tall run in a 1632×117 bar cannot move a global percentage and gets diluted across the 12×12 cell grid. The differ is structurally blind to it; so is a spot-check of computed properties, because the *authored* values were all correct — `dom-contract` passed 158/158 while the line was absent.

- Bands come from the intake measurement (`text-extents contract`, webflow-core § A, pipeline step 3b) — the same numbers the build targeted.
- **BLANK on either side = FAIL.** A clipped or missing run looks exactly like an empty band; that is the point.
- **Δwidth is tracking, Δleft is position.** Fix tracking with `text-extents solve --target= --measured= --ls= --gaps=` — one measured point closes it, because ink width is linear in letter-spacing. Never re-derive letter-spacing from the source's numbers a second time.
- Mind DPR: `verify-section` reports CSS px while writing a DPR-2 PNG. Pass `--built-scale=2`, or the band silently answers with the *wrong row* and the numbers still look plausible.
- Run `ref-integrity.js check` first — it confirms both sides describe the same box and DPR before any of this means anything.

## 1.5 CONTENT GATE — zero placeholders (deterministic, run every section)

Read every text node + image binding in the built subtree and FAIL on any hit:

- [ ] **Webflow default strings:** `This is some text inside of a div block` · `Heading` (bare) · `Button Text` · `Name`/`Email` bare labels on styled forms · `Lorem ipsum` (any case) · `Tab Link 1` · `List Item` · `Untitled`
- [ ] **Agent-invented filler:** any string not present in the intake spec / source. Diff built text ↔ spec text as SETS — extra string = invented, missing string = omitted content. Both FAIL
- [ ] **Verbatim check:** each string character-for-character vs source (punctuation, casing, `&`, dashes, superscripts, non-breaking spaces). Re-worded, shortened, or "cleaned up" copy = FAIL
- [ ] **Images:** every `Image` bound to an uploaded asset id — no Webflow placeholder asset (`placeholder.*.svg`), no `example.com`, no random stock, no hotlinked source URL
- [ ] **Alt text:** real and specific per image (from source), never empty on content images, never the filename
- [ ] **Counts:** N text nodes / N images in reference == N built (a dropped list item or missing eyebrow line is an omission, rule NOTHING SILENTLY OMITTED)

Placeholder allowed ONLY where the user explicitly said so — logged in the spec `unknowns` as user-approved.

## 1.6 ICON / SVG AUDIT (every section with vector assets — the "broken icons" gate)

Per `Image` element carrying an SVG:

- [ ] Bound via `set_image_asset` **asset id** — never `src` attribute / raw CDN URL
- [ ] Asset URL returns HTTP 200 (`curl -sI` or fetch); 403/404 → re-upload
- [ ] Source file has `viewBox` (webflow-platform § SVG pre-flight) — missing = collapses or won't scale
- [ ] Class sets explicit size (`width`+`height`, or `width:100%`+`max-width`) — never size-less
- [ ] `flex-shrink: 0` when inside a flex row (else squashed to 0 on narrow viewports)
- [ ] Colors baked in the file (no `currentColor`, no CSS-dependent fill) and match the reference hex
- [ ] No `<style>`/`<script>`/`<foreignObject>`/external `<use>` inside; internal ids unique per file
- [ ] **Rendered box non-zero at EVERY breakpoint** (snapshot per breakpoint; 0×0 or 300×150 default = broken)
- [ ] Count matches the reference exactly — no missing, no duplicated icon
- [ ] Visually correct in the shot: right glyph, not a black square, not clipped by parent `overflow: hidden`, not invisible on same-color bg

Any fail → fix at source (re-export/repair SVG → re-upload → re-bind), never by adding CSS hacks. Log unrepairable cases (e.g. gradient-stroke icon) to impossible_cases.md with the chosen fallback.

## 1.7 EFFECT COMPLETENESS GATE (anti-simplification, rule NOTHING SILENTLY OMITTED)

Walk the intake `effects:` manifest row by row. Every row must resolve to exactly one:

| Status | Evidence required |
|---|---|
| `built` (T1) | style read-back shows the property on the class/pseudo-state, values match |
| `built` (T2) | the real child element exists with its class + styles; rendered shot shows the effect |
| `interactions-queued` (T3) | full build-script in pending_designer_work.md marked `[critical]` — trigger, target class/component, all stops, duration, easing, loop, stagger; native Interactions panel (no injected GSAP) |
| `code-tier` (T4) | descent proof + user's verbatim authorization logged in registry `## Custom-Code-Exceptions` + embed present + it actually animates in the published page. Missing proof or permission → treat as ban hit (§1), not as `built` |
| `native-fallback` | the user was asked about an eligible T4 case and chose native (or didn't answer) — the fallback that shipped is named in the report |
| `impossible` | impossible_cases.md entry + the native alternative that shipped, named in the report |

Row with no status, or an effect visible in the reference that never entered the manifest → FAIL (go back to intake, extend the manifest, build it). "Simplified", "close enough", "skipped for now" are not valid statuses.

## 1.8 BEHAVIOUR PARITY GATE (HTML / live-URL references — the "it looks right but does nothing" gate)

A static-only match is not a match. Whenever the reference is runnable (HTML delivery or live URL — html-intake §C.6 / url-intake), the built page is measured in the SAME states as the reference and the two are compared, not described.

**Capture both sides identically** (same widths, same state list, unique ports):

```
node "$WF/scripts/state-shot.js"    "<ref-url|file://…>" ref-cache/…/{sec}   1440 "{refSel}"   "base,auto,scroll:40" 0 9271
node "$WF/scripts/state-shot.js"    "<published-url>"    built/{sec}          1440 "{builtSel}" "base,auto,scroll:40" 0 9272
node "$WF/scripts/motion-verify.js" "<published-url>"    built/{sec}-motion.json 1440 "{builtSel}" all 0 9262
node "$WF/scripts/pixel-diff.js"    ref-cache/…/{sec}-hover-x.png built/{sec}-hover-y.png     # one score per matched state
```

Match states by visual role AND position (reference `.btn` ↔ built `.hero__cta`; repeated blocks: same index — `auto` hovers the FIRST match on each side, so compare card 1 to card 1). Never by selector name.

- [ ] **Every hover/focus/active state in the manifest has a state shot on both sides**, scored ≥99% like the resting shot. Missing state on the built side = the effect was not built, regardless of the base score
- [ ] **Hover DELTA exists:** built `base ↔ hover` differs in the same regions the reference's `base ↔ hover` differs. Identical base/hover on the built side = dead hover (transition on the wrong class, or state never set)
- [ ] **Scroll states match:** reveals fired, parallax/sticky offsets landed, nothing stuck at `opacity: 0` (compare `scroll-*` shots; also `initialStateFlash` in the motion JSON)
- [ ] **Timing parity:** each animated row's `durationDeclaredMs` (built) == the reference value ±10% for CSS-owned motion; panel-owned motion has no declared duration → require `moved: true` + observed within ±40% (motion-build § Phase 5). Easing keyword/curve matches the manifest
- [ ] **Trigger parity:** the built motion fires on the same trigger (hover/scroll-in/load/click/mouse-move), fires the same number of times (once vs loop), and respects reduced-motion if the reference did
- [ ] **`jankProps` empty** on the built page — a parity that only exists via animated width/height/top/left is a rebuild, not a pass
- [ ] **Pseudo-element children present** (T2 rows): the reference's `::before`/`::after` visuals appear in the built shots — a missing glow/underline/shape is a visible diff even at high base score
- [ ] **Canvas/T4 rows actually run** in the published page (motion JSON shows movement inside the embed's wrapper), and their parameters match §C.4 capture — a frozen or "similar" canvas FAILS

**`reference-not-run` IS A PROVEN FAILURE, NOT A CHOICE (v1.9.0).** This waiver disables the hardest gate in the system, so it costs evidence: paste the exact command you ran and the exact error it returned, **then retry once through a local static server** — `python3 -m http.server 8765 --directory <ref-folder>` then `http://localhost:8765/<file>.html` (fixes the majority of `file://` failures: module scripts, CORS-blocked fetches, absolute `/asset` paths). Only if that retry also fails, with its output shown, may the row be marked `reference-not-run`. Then the gate degrades to: manifest rows verified individually on the built page (motion-verify + state shots on the built side only), and the report states the baseline was unavailable **and why, in the tool's words**. A bare "reference wouldn't run" is an unverified claim = FAIL.

## 1.9 A11Y + PERF GATE (scored, every section — v1.9.0)

Same single publish, same browser session as §0. One command, budget-based, fail-closed:

```
node "$WF/scripts/page-audit.js" <published-url> built/{sec}-audit.json 1440 "{builtSel}" 0 9281
node "$WF/scripts/page-audit.js" <published-url> built/{sec}-audit-390.json 390 "{builtSel}" 1 9282   # touch targets + mobile type
```

Hard FAIL: text contrast <4.5:1 (<3:1 for ≥24px or ≥18.66px bold) · an interactive element with no accessible name · an interactive element not keyboard-reachable · heading level skipped or >1 `h1` · `img` with no `alt` attribute · a single image >300KB or >1.8MB total · DOM depth >32 · Lottie/JSON >500KB · CLS >0.1 · at mobile widths any touch target <44px.
Warn (fix if cheap, always reported): image served >2.5× its displayed width · DOM >1500 nodes · long tasks >200ms.

Budgets are overridable per project — `--budget imageKB=200,domDepth=28` — and any override is stated in the report. Contrast pairs the measurement cannot resolve (text over a gradient or image) come back as `contrastSkipped`: check those visually in §3 and say so; "unmeasurable" is never "passed". Every failure names the element, so the fix is targeted, native, and re-scored in the same fix pass as the pixel diffs.

## 2. Property diff — SPEC-DRIVEN, not catalog-driven (v1.8.0)

Read back only what can actually be wrong. Three sets, nothing else:

1. **Every property in the intake spec FILE** (`$WF/sites/<site-id>/specs/<section>.md`) for that class — you set it, so you verify it. Diff against the written contract, never a recollection of it (v1.10.0). This is the whole diff for most classes.
2. **Inheritance-risk set** (silently wrong even when never set): `color`, `font-family`, `font-weight`, `line-height` — check the class, then the parent chain.
3. **Webflow-trap set** (the properties this platform loses): `grid-column-gap` + `grid-row-gap` (both longhands, flex included) · all 4 `border-radius` corners · width strategy (`width` vs `width:100%`+`max-width`) · `padding-*`/`margin-*` sides that a shorthand would have swallowed · `box-shadow` layer count · `background-image` gradient stops+angle · `transition-*` longhand triple where a hover exists · `position`+offsets on anything absolute/sticky.

Not in any of the three sets and not visibly wrong in the shot → **do not read it back**. The visual score (§3) is the backstop; re-reading 40 properties per class to confirm defaults is the waste this replaces. Anything the heatmap flags gets read back regardless of set membership.

LIGHT tier = sets 2+3 only, plus the spec's layout/type/color values. FULL tier = all three sets in full, and always for section 1, heroes, forms/sliders/tabs/navbar, anything the user flagged.

**Severity:** CRITICAL (wrong element/text/missing/layout direction) → must fix · MAJOR (wrong color/font-size/spacing >5px/missing shadow) → must fix · MINOR (≤1px off) → fix if budget, flag · COSMETIC (sub-pixel) → note only.

## 3. Visual compare (mandatory every section — the accuracy gate)

**Pre-check (from the RENDER IS GROUND TRUTH rule):** the reference render was studied BEFORE building — per-char gradients, blurs, shadows, overlaps, wrap points are already in the spec. Verify each of those flagged features explicitly here; values-only diff misses them.

**Automated (primary):** reference image vs built shot, side by side, scan order §0. **Quantified score:** `node "$WF/scripts/pixel-diff.js" <reference.png> <built.png>` → prints an `EVIDENCE pixel-diff` block. **Three independent PASS conditions, all required (v1.9.0, fail-closed):**
1. **global match ≥99%** (antialiasing + font-hinting tolerance built in; both images normalized to the same width by area-average downscale),
2. **height delta ≤2%** — a section that is 200px too tall used to PASS because the diff cropped it away; it now FAILs,
3. **no 12×12 grid cell >25% mismatched** — one destroyed component inside a big section stays under the 3% global budget; it now FAILs by region even at 98.5% global.

Any one of the three failing = FAIL → read the named regions → fix pass. Score can't be computed (size mismatch, blank capture) → fix the capture, never skip the score. Published-page shot (not snapshot) for the scored compare when typography is involved — snapshot lies about fonts (§0).

**EVIDENCE RULE — the score is the tool's output, never your sentence.** The `EVIDENCE pixel-diff` block is pasted verbatim into the report (§5). A report carrying a number without the block is not a passed gate, it is an unverified claim; the same applies to `page-audit`, `state-shot` and `motion-verify` output. Regression suite for the gate itself: `node "$WF/scripts/pixel-diff.test.js"` (5 cases, must stay green after any change to the differ).

**IMAGE DISCIPLINE — corrected in v2.0 on measured evidence.** An image block costs **~1,500 tokens maximum, at any resolution**: Anthropic bills `(width × height) / 750` after downscaling the long edge to 1568px, so a 3840×1800 render and a 1920×900 render both land at ~1,536 tokens. Verified against the 2026-07-31 transcript: six image views totalled 917,364 base64 chars ≈ **9k tokens for all six**.

v1.11.0 claimed 5k-66k per PNG and rationed looking on that basis. That figure was **wrong by ~40×** — it was context growth measured around image calls, misattributed to the images. The real driver is turns × context size (that session: 538 turns, 172M cache-read, images 0.005% of it). Rationing the reference view cost accuracy and saved nothing, so it is reversed here.

**Budget: 2-4 views per section (~6k tokens) — the cheapest accuracy in the pack.** Look where the table below says look. `ref-digest.js` still runs, but as a *supplement* to the eye for what the eye reads unreliably (exact gradient ramps, blur radii, sub-pixel overlaps), never as a replacement for Rule 1.

| Situation | Do |
|---|---|
| Reference render, before building | **ALWAYS open it** — Rule 1, non-negotiable. Per-char gradients, layered shadows, blurs, overlaps and true wrap points are invisible in values and this is the only place they are caught |
| A width scored **PASS** (≥99% + height ≤2% + no hot region) | **The anchor view still happens** (row above) — a PASS is not a substitute for it. Beyond the anchor, do not re-open a PASS width unless the anchor view raised a question about it: the differ compared every pixel, checked height, and checked per-region concentration, so a second look at a clean width adds nothing. But a PASS has hidden a whole missing text line before (98.75%, zero hot regions), so the anchor is never traded away for context |
| A width scored **FAIL** | **Open the built shot and the diff PNG** for the named hot regions. That is what the coordinates are for |
| A width scored **UNSCORED** (no reference frame) | **Open the built shot** — there is no measurement, so your eye is the only gate. Report it as visually-checked-only |
| Anchor pass, once per section, at the primary width | **Open the built shot side by side with the reference once**, even on PASS. Holistic wrongness that is spatially identical to the reference (right pixels, wrong feel — balance, hierarchy, an image that is technically placed but visually wrong) is the one class the differ cannot see. **This row paid for itself on kush-header:** it caught an entirely missing text line behind a 98.75% PASS with zero hot regions and a 158/158 property-equality PASS. v1.11.0 had removed this view to save tokens; it cost ~1.5k and saved a shipped defect |
| Behaviour states, a11y, content, icons, effects | **Text.** `state-shot`/`motion-verify`/`page-audit` emit measured verdicts; open a state PNG only when its pair scores FAIL |

So: **one reference view + one anchor comparison + images only on failures** = 2-4 views, ~6k tokens. Never skip a view the table asks for; never open one "to be sure" on a width that scored PASS — the measurement compared every pixel, the height and the per-region concentration, and it is stricter than the eye. The cost to control is turns and context, not images.

**Human (last resort only, and never as a substitute for a measurement):** if and only if a tool cannot reach the state, ask the user to confirm in Designer; mismatch → exact location → targeted diff on that element only (never full re-verify). No Designer open = unconfirmed, never accept bare "looks good."

## 4. Fix pass (batched, convergent)

Collect ALL diffs → ONE batched fix call → re-check ONLY changed items + 3-5 neighbors (never the whole section). Loop while each pass closes ≥1 diff; 2 consecutive no-progress passes = STALLED → report. Recurring diff across 2 passes = wrong property name/format for Webflow — fix format, not value. New diff introduced → revert, alternative approach. Priority: CRITICAL → MAJOR → MINOR → COSMETIC.

**STALLED IS NOT AN EXIT DOOR (v1.9.0).** STALLED is **illegal while any CRITICAL or MAJOR diff is open** — that state is FAIL, and FAIL means keep working or rebuild, not report-and-leave. STALLED is reachable only for MINOR/COSMETIC remainders or a documented impossible case, and only with, per remaining diff: the exact property/region, **what was attempted in each of the two passes**, why it did not move, the artifact path (diff PNG / audit JSON) that proves it, and what would resolve it (Designer step, asset re-export, platform limit). A STALLED report without that per-diff evidence is an unverified claim, treated as FAIL.

Can't close: unsupported property → impossible_cases.md + alternative · API can't set → pending_designer_work.md · value right but visual wrong → Webflow rendering bug, flag to user.

## 5. Match report (mandatory, every section)

```
PIXEL-VERIFY — [section]  diff-depth: LIGHT|FULL  fix passes: N
NATIVE       ✓ 0 embeds/custom code/style-attrs, native modules used, element_builder only
             code tier: [none] | [E4 canvas — descent proof ✓ · user authorized "<their yes>" [date] · registry logged ✓]
             asked-and-declined: [effects where the user chose the native fallback | none]
CONTENT      ✓ 0 placeholders · N/N strings verbatim · N/N images real assets + alt
ICONS/SVG    ✓ N/N bound by asset id, viewBox, sized, 200 OK, non-zero at all breakpoints
STRUCTURE    ✓ N/N elements, classes, exact copy, order
PROPERTIES   ✓ N/N → fixed: [list] · remaining: [list or none]
EFFECTS      N/N manifest rows resolved — built: E1,E2 · interactions-queued: E3 · code-tier: E4 · impossible: none
BEHAVIOUR    [HTML/URL ref] states scored: base NN.N% · hover ×n NN.N% · scroll NN.N% · click/focus NN.N%
             hover-delta present n/n · timing ✓ (declared vs reference) · triggers ✓ · jank 0 · canvas running ✓
             | reference-not-run: [reason] → built-side measurement only
VISUAL       pixel-score: NN.N% (≥99) · height delta N.N% (≤2) · hot regions: none|[list] · render-features verified: [gradients/blurs/overlaps]
             human: confirmed/unconfirmed
A11Y/PERF    contrast n/n · named+reachable n/n · headings ✓ · alt n/n · images NKB · DOM depth N · CLS N.NN   → PASS|FAIL
PUBLISHES    N (max 2) · unverified states: none | [elements past the auto cap]
EVIDENCE     ```
             <verbatim EVIDENCE pixel-diff block>
             <verbatim EVIDENCE page-audit block>
             ```
IMPOSSIBLE   none | [list + native alternative]
VERDICT      PASS → responsive-pass | STALLED → [each diff + reason + resolution] | FAIL → rebuild
```

NATIVE / CONTENT / ICONS / EFFECTS / BEHAVIOUR / A11Y-PERF lines are hard gates and come first — an unauthorized embed, one placeholder string, one broken icon, one unresolved effect row, one dead hover, or one a11y failure never reaches PASS regardless of pixel score. **The EVIDENCE block is not optional**: a report whose numbers are not backed by the tools' own output is an unverified claim, and an unverified claim is not a PASS (§3 evidence rule). Only PASS (or accepted PARTIAL) proceeds. Append the summary to this site's `build_state.json` → `sections[].verification_report` (+ `a11y_perf`, `publishes`).

**Permission wording is accounting, not vibes:** `asked-and-declined` means the user answered no. A user who never answered is `asked-no-answer → native fallback shipped: [what]`. Never record silence as a decision (agent Rule 4).

## 6. Edge cases

| Case | Verify |
|---|---|
| Gradient text | built as a `DOM span` child with `background-image` + `background-clip: text` + `color: transparent` (`build-reference` § Known traps) — verify the span exists, the gradient renders, and no `-webkit-*` was attempted. Solid fallback + ledger ONLY if the style tool actually rejected the unprefixed set |
| Backdrop blur | backdrop-filter present, radius matches |
| Per-corner radius | each corner longhand individually |
| Nested flex | parent AND child flex props independently |
| Sticky | position: sticky + offset; behavior needs scroll |
| Forms | input styles separate from form layout; see webflow-platform § Native form gotchas |
| Video | poster + play overlay positioning |
| Rich text | heading/paragraph styles inside container cascade differently |
