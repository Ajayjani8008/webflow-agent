---
name: pixel-verify
description: Mandatory verification loop after building each Webflow section — tier auto-selected (LIGHT/FULL), automated screenshot capture, DOM read-back, property diff against the intake spec, visual compare, per-state behaviour parity (hover/scroll/load vs the reference), one batched fix pass. A section is not done until this passes. This is the accuracy engine.
---

# Pixel Verify

Run after every section build, before responsive-pass. Never skipped. **Goal: the built section is visually indistinguishable from the reference, side by side — converge to ZERO visual diffs, don't stop early.** Automated comparison = primary evidence.

**CONVERGENCE, NOT A FIXED CAP.** Fix passes continue as long as each pass closes ≥1 diff. Stop ONLY when: zero visual diffs (PASS), or remaining diffs are documented impossible cases, or 2 consecutive passes close nothing (STALLED → report each remaining diff + exact reason + what would resolve it). Declaring done with visible diffs = failure; the user must never have to say "retry" or "force match". Waste = re-verifying what already passed — each pass re-checks ONLY open diffs + neighbors, never the full section again.

## T. Depth selection (property diff only — visual compare is NEVER reduced)

**Side-by-side visual compare against the reference runs for EVERY section, both tiers, no exceptions.** Only the property-diff table depth varies:
- **LIGHT** (ALL true: ≤8 elements · no gradients · no absolute/sticky · no form/slider/tabs/navbar · simple flex · no multi-layer shadows): spot-check per class — `display`/`flex-direction` · `grid-column-gap`/`grid-row-gap` · `padding-top`/`padding-bottom` · `font-size` · `font-weight` · `color` · `background-color` · width strategy. Any fail OR any visual diff → escalate to FULL.
- **FULL** otherwise, and always for section 1, heroes, anything user flagged.

## 0. Screenshot capture

1. `element_snapshot_tool` on built section. 2. Reference: Figma `get_screenshot` (from cache) or original image. Both must exist — no screenshots = blind.

**`element_snapshot_tool` DOES NOT LOAD CUSTOM WEB FONTS (verified 2026-07-12).** Custom fonts render as serif fallback — mangled-Times H1 = snapshot artifact, NOT a bug. Before "fixing" a font mismatch: confirm font installed (`data_fonts_tool`) + class `font-family` correct — both right = tool lying. **Never restyle typography off the snapshot.** Typography + anything font-metric-dependent (wrapping, line count, overflow) → verify against PUBLISHED page only.

**PUBLISH ONCE.** Publishing = slow + token cost. Interim checks = snapshot (free). Batch ALL fixes → publish once for final typography + responsive sign-off (all breakpoints in one publish). Re-publish only if that pass finds a real defect.

**Published shots:** `node docs/memory/shot-el.js <url> <out.png> <W> "<cssSelector>" <mobile:1|0> <port>` (needs `ws`: `npm i ws pngjs pixelmatch --no-save` at home dir; unique port per run).

**Interaction states:** `node docs/memory/webflow/state-shot.js <url> <outPrefix> <W> "<sel>" "base,auto,scroll:40,click:.tab" <mobile> <port>` (lives beside the other verify scripts — `shot-el.js`, `pixel-diff.js`, `motion-verify.js`, `ref-extract.js`) — resting + hover + focus + click + scrolled shots in one browser launch, on a published URL or a `file://` reference. Required for §1.8; `pixel-diff.js` scores each matched pair. (`auto` hovers up to 6 interactive descendants; name selectors explicitly when the auto set misses one.)
- **Clip to element's bounding box, NOT `{x:0,y:0}`** — CDP clip is PAGE-origin; fixed `y:0` captures blank page top. ~5-6KB PNG = blank capture → wrong clip or unpublished/opacity-hidden page.
- **Mobile: `--window-size` does NOT set layout viewport** — script uses CDP `Emulation.setDeviceMetricsOverride {mobile:true, deviceScaleFactor:2}` + ws header `Origin: http://localhost` + ABSOLUTE `--user-data-dir`. See [[webflow-mcp-gotchas]].

**Compare scan order:** proportions → layout grid → spacing rhythm → alignment edges → type hierarchy → color blocks → radii → shadows → asset crops. Quantify + locate mismatches ("hero__title 10px lower than reference").

## 1. Structure read-back (evidence, not attestation)

**POST-BATCH COUNT CHECK — after EVERY `data_element_builder` call, not just final verify.** Builder can silently duplicate a whole subtree (slow/retried bridge call → second content block, contiguous ids). Query direct-child count (depth 1-2) = what you built; duplicate/orphan → `remove_element` NOW, before styling.

MCP: `element_snapshot_tool` / `data_element_tool` get. API: `GET /v2/pages/{id}/dom`. Check vs spec:
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

Any hit = build void regardless of visual match. Delete, rebuild native, restart verify. **Whitelist (exact match only, never "similar"):** ① snippet logged in registry.md `## Custom-Code-Exceptions` via user-invoked `/custom-code-once` ② a **T4 effect from the intake manifest** (canvas/JS-driven only, per build-reference § Effect Fidelity Ladder T4) with its registry log present. A T4 hit that is NOT in the manifest, or carries layout/spacing/typography/color/hover CSS, or has no registry entry → still an instant FAIL.

## 1.5 CONTENT GATE — zero placeholders (deterministic, run every section)

Read every text node + image binding in the built subtree and FAIL on any hit:

- [ ] **Webflow default strings:** `This is some text inside of a div block` · `Heading` (bare) · `Button Text` · `Name`/`Email` bare labels on styled forms · `Lorem ipsum` (any case) · `Tab Link 1` · `List Item` · `Untitled`
- [ ] **Agent-invented filler:** any string not present in the intake spec / source. Diff built text ↔ spec text as SETS — extra string = invented, missing string = omitted content. Both FAIL
- [ ] **Verbatim check:** each string character-for-character vs source (punctuation, casing, `&`, dashes, superscripts, non-breaking spaces). Re-worded, shortened, or "cleaned up" copy = FAIL
- [ ] **Images:** every `Image` bound to an uploaded asset id — no Webflow placeholder asset (`placeholder.*.svg`), no `example.com`, no random stock, no hotlinked source URL
- [ ] **Alt text:** real and specific per image (from source), never empty on content images, never the filename
- [ ] **Counts:** N text nodes / N images in reference == N built (a dropped list item or missing eyebrow line is an omission, Rule 12)

Placeholder allowed ONLY where the user explicitly said so — logged in the spec `unknowns` as user-approved.

## 1.6 ICON / SVG AUDIT (every section with vector assets — the "broken icons" gate)

Per `Image` element carrying an SVG:

- [ ] Bound via `set_image_asset` **asset id** — never `src` attribute / raw CDN URL
- [ ] Asset URL returns HTTP 200 (`curl -sI` or fetch); 403/404 → re-upload
- [ ] Source file has `viewBox` (build-reference § SVG pre-flight) — missing = collapses or won't scale
- [ ] Class sets explicit size (`width`+`height`, or `width:100%`+`max-width`) — never size-less
- [ ] `flex-shrink: 0` when inside a flex row (else squashed to 0 on narrow viewports)
- [ ] Colors baked in the file (no `currentColor`, no CSS-dependent fill) and match the reference hex
- [ ] No `<style>`/`<script>`/`<foreignObject>`/external `<use>` inside; internal ids unique per file
- [ ] **Rendered box non-zero at EVERY breakpoint** (snapshot per breakpoint; 0×0 or 300×150 default = broken)
- [ ] Count matches the reference exactly — no missing, no duplicated icon
- [ ] Visually correct in the shot: right glyph, not a black square, not clipped by parent `overflow: hidden`, not invisible on same-color bg

Any fail → fix at source (re-export/repair SVG → re-upload → re-bind), never by adding CSS hacks. Log unrepairable cases (e.g. gradient-stroke icon) to impossible_cases.md with the chosen fallback.

## 1.7 EFFECT COMPLETENESS GATE (anti-simplification, Rule 12)

Walk the intake `effects:` manifest row by row. Every row must resolve to exactly one:

| Status | Evidence required |
|---|---|
| `built` (T1) | style read-back shows the property on the class/pseudo-state, values match |
| `built` (T2) | the real child element exists with its class + styles; rendered shot shows the effect |
| `interactions-queued` (T3) | full build-script in pending_designer_work.md marked `[critical]` — trigger, target class/component, all stops, duration, easing, loop, stagger; native Interactions panel (no injected GSAP) |
| `code-tier` (T4) | embed present + registry `## Custom-Code-Exceptions` entry + it actually animates in the published page |
| `impossible` | impossible_cases.md entry + the native alternative that shipped, named in the report |

Row with no status, or an effect visible in the reference that never entered the manifest → FAIL (go back to intake, extend the manifest, build it). "Simplified", "close enough", "skipped for now" are not valid statuses.

## 1.8 BEHAVIOUR PARITY GATE (HTML / live-URL references — the "it looks right but does nothing" gate)

A static-only match is not a match. Whenever the reference is runnable (HTML delivery or live URL — intake §C.6 / url-intake), the built page is measured in the SAME states as the reference and the two are compared, not described.

**Capture both sides identically** (same widths, same state list, unique ports):

```
node docs/memory/webflow/state-shot.js    "<ref-url|file://…>" ref-cache/…/{sec}   1440 "{refSel}"   "base,auto,scroll:40" 0 9271
node docs/memory/webflow/state-shot.js    "<published-url>"    built/{sec}          1440 "{builtSel}" "base,auto,scroll:40" 0 9272
node docs/memory/webflow/motion-verify.js "<published-url>"    built/{sec}-motion.json 1440 "{builtSel}" all 0 9262
node docs/memory/webflow/pixel-diff.js    ref-cache/…/{sec}-hover-x.png built/{sec}-hover-y.png     # one score per matched state
```

Match states by visual role (reference `.btn` ↔ built `.hero__cta`), not by selector name.

- [ ] **Every hover/focus/active state in the manifest has a state shot on both sides**, scored ≥97% like the resting shot. Missing state on the built side = the effect was not built, regardless of the base score
- [ ] **Hover DELTA exists:** built `base ↔ hover` differs in the same regions the reference's `base ↔ hover` differs. Identical base/hover on the built side = dead hover (transition on the wrong class, or state never set)
- [ ] **Scroll states match:** reveals fired, parallax/sticky offsets landed, nothing stuck at `opacity: 0` (compare `scroll-*` shots; also `initialStateFlash` in the motion JSON)
- [ ] **Timing parity:** each animated row's `durationDeclaredMs` (built) == the reference value ±10% for CSS-owned motion; panel-owned motion has no declared duration → require `moved: true` + observed within ±40% (motion-build § Phase 5). Easing keyword/curve matches the manifest
- [ ] **Trigger parity:** the built motion fires on the same trigger (hover/scroll-in/load/click/mouse-move), fires the same number of times (once vs loop), and respects reduced-motion if the reference did
- [ ] **`jankProps` empty** on the built page — a parity that only exists via animated width/height/top/left is a rebuild, not a pass
- [ ] **Pseudo-element children present** (T2 rows): the reference's `::before`/`::after` visuals appear in the built shots — a missing glow/underline/shape is a visible diff even at high base score
- [ ] **Canvas/T4 rows actually run** in the published page (motion JSON shows movement inside the embed's wrapper), and their parameters match §C.4 capture — a frozen or "similar" canvas FAILS

Reference could not be run (`reference-not-run`) → this gate degrades to: manifest rows verified individually on the built page (motion-verify + state shots on the built side only), and the report says the reference baseline was unavailable. It is never silently skipped.

## 2. Property diff (FULL tier — LIGHT uses spot-check list from §T)

Per class, read back applied styles, diff value-by-value: font-family/weight/size/line-height/letter-spacing · color/background-color · background-image (gradient stops+angle) · display/flex-direction/flex-wrap · justify-content/align-items/align-self · gap (both longhands) · padding ×4 · margin ×4 · width/max-width/min-width/height · border-radius ×4 corners · border (width/style/color per side) · box-shadow (x/y/blur/spread/color/inset) · opacity · filter · object-fit/position · position/top/right/bottom/left · z-index · overflow · text-align/decoration/transform · white-space/word-break/overflow-wrap.

**False-positive rules:**
1. Absent but inherited (color, font-family) → check parent; correct there = PASS "inherited"
2. Variables count as resolved value — resolve, then compare
3. Don't flag Webflow defaults (`box-sizing: border-box` always on)
4. Final computed value matters, not which class carries it
5. Tolerance: ±0.5px lengths, ±0.01 opacity, exact colors/integers
6. Gradients: compare stops + angle, not string format
7. Shorthand vs stored longhands: compare resolved values

**Severity:** CRITICAL (wrong element/text/missing/layout direction) → must fix · MAJOR (wrong color/font-size/spacing >5px/missing shadow) → must fix · MINOR (≤1px off) → fix if budget, flag · COSMETIC (sub-pixel) → note only.

## 3. Visual compare (mandatory every section — the accuracy gate)

**Pre-check (from intake Rule 1):** the reference render was studied BEFORE building — per-char gradients, blurs, shadows, overlaps, wrap points are already in the spec. Verify each of those flagged features explicitly here; values-only diff misses them.

**Automated (primary):** reference image vs built shot, side by side, scan order §0. **Quantified score:** `node docs/memory/pixel-diff.js <reference.png> <built.png>` → prints mismatch %. **PASS line: ≥97% pixel match** (antialiasing + font-hinting tolerance built in; both images at same width first). Score < 97% → list concrete regions from the diff heatmap output → fix pass. Score can't be computed (size mismatch, blank capture) → fix the capture, never skip the score. Published-page shot (not snapshot) for the scored compare when typography is involved — snapshot lies about fonts (§0).

**Human (secondary):** ask user to confirm in Designer; mismatch → exact location → targeted diff on that element only (never full re-verify). No Designer open = unconfirmed, never accept bare "looks good." Visual catches what property diff misses: per-char styling, font rendering, color profile, image quality, balance, shadow softness, gradient smoothness.

## 4. Fix pass (batched, convergent)

Collect ALL diffs → ONE batched fix call → re-check ONLY changed items + 3-5 neighbors (never the whole section). Loop while each pass closes ≥1 diff; 2 consecutive no-progress passes = STALLED → report. Recurring diff across 2 passes = wrong property name/format for Webflow — fix format, not value. New diff introduced → revert, alternative approach. Priority: CRITICAL → MAJOR → MINOR → COSMETIC.

Can't close: unsupported property → impossible_cases.md + alternative · API can't set → pending_designer_work.md · value right but visual wrong → Webflow rendering bug, flag to user.

## 5. Match report (mandatory, every section)

```
PIXEL-VERIFY — [section]  diff-depth: LIGHT|FULL  fix passes: N
NATIVE       ✓ 0 embeds/custom code/style-attrs, native modules used, element_builder only
             (authorized T4: [none | list + registry logged])
CONTENT      ✓ 0 placeholders · N/N strings verbatim · N/N images real assets + alt
ICONS/SVG    ✓ N/N bound by asset id, viewBox, sized, 200 OK, non-zero at all breakpoints
STRUCTURE    ✓ N/N elements, classes, exact copy, order
PROPERTIES   ✓ N/N → fixed: [list] · remaining: [list or none]
EFFECTS      N/N manifest rows resolved — built: E1,E2 · interactions-queued: E3 · code-tier: E4 · impossible: none
BEHAVIOUR    [HTML/URL ref] states scored: base NN.N% · hover ×n NN.N% · scroll NN.N% · click/focus NN.N%
             hover-delta present n/n · timing ✓ (declared vs reference) · triggers ✓ · jank 0 · canvas running ✓
             | reference-not-run: [reason] → built-side measurement only
VISUAL       pixel-score: NN.N% (≥97 = PASS) · render-features verified: [gradients/blurs/overlaps checked]
             human: confirmed/unconfirmed
IMPOSSIBLE   none | [list + native alternative]
VERDICT      PASS → responsive-pass | STALLED → [each diff + reason + resolution] | FAIL → rebuild
```

NATIVE / CONTENT / ICONS / EFFECTS / BEHAVIOUR lines are hard gates and come first — an unauthorized embed, one placeholder string, one broken icon, one unresolved effect row, or one dead hover never reaches PASS regardless of pixel score. Only PASS (or accepted PARTIAL) proceeds. Append summary to build_state.json `verification_reports`.

## 6. Edge cases

| Case | Verify |
|---|---|
| Gradient text | background-clip: text — API can't set (build-reference § style tool limits) → fallback color + ledger |
| Backdrop blur | backdrop-filter present, radius matches |
| Per-corner radius | each corner longhand individually |
| Nested flex | parent AND child flex props independently |
| Sticky | position: sticky + offset; behavior needs scroll |
| Forms | input styles separate from form layout; see build-reference § Form gotchas |
| Video | poster + play overlay positioning |
| Rich text | heading/paragraph styles inside container cascade differently |
