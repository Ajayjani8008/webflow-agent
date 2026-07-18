---
name: pixel-verify
description: Mandatory verification loop after building each Webflow section — tier auto-selected (LIGHT/FULL), automated screenshot capture, DOM read-back, property diff against the intake spec, visual compare, one batched fix pass. A section is not done until this passes. This is the accuracy engine.
---

# Pixel Verify

Run after every section build, before responsive-pass. Never skipped. Budget: 1 verify + max 2 fix passes; still failing → report remaining diffs honestly, don't loop. Automated comparison = primary evidence.

## T. Tier selection (first — pick verify depth)

**LIGHT** when ALL true: ≤8 elements · no gradients · no absolute/sticky positioning · no form/slider/tabs/navbar · simple flex/single-column · no multi-layer shadows/per-corner radius.
**FULL** otherwise, and ALWAYS for: section 1 of a build, hero sections, anything user flagged as off.

| Step | LIGHT | FULL |
|---|---|---|
| Structure read-back + ban sweep | ✓ full | ✓ full |
| Property diff | 8-prop spot check per class | full table |
| Screenshot compare | 1 snapshot scan | snapshot + reference side-by-side |
| Report | condensed | full |

LIGHT spot-check props: `display`/`flex-direction` · `grid-column-gap`/`grid-row-gap` · `padding-top`/`padding-bottom` · `font-size` · `font-weight` · `color` · `background-color` · width strategy (`width:100%`+`max-width`, not bare px). Any LIGHT check fails → escalate that section to FULL.

## 0. Screenshot capture

1. `element_snapshot_tool` on built section. 2. Reference: Figma `get_screenshot` (from cache) or original image. Both must exist — no screenshots = blind.

**`element_snapshot_tool` DOES NOT LOAD CUSTOM WEB FONTS (verified 2026-07-12).** Custom fonts render as serif fallback — mangled-Times H1 = snapshot artifact, NOT a bug. Before "fixing" a font mismatch: confirm font installed (`data_fonts_tool`) + class `font-family` correct — both right = tool lying. **Never restyle typography off the snapshot.** Typography + anything font-metric-dependent (wrapping, line count, overflow) → verify against PUBLISHED page only.

**PUBLISH ONCE.** Publishing = slow + token cost. Interim checks = snapshot (free). Batch ALL fixes → publish once for final typography + responsive sign-off (all breakpoints in one publish). Re-publish only if that pass finds a real defect.

**Published shots:** `node docs/memory/shot-el.js <url> <out.png> <W> "<cssSelector>" <mobile:1|0> <port>` (needs `ws`: `npm i ws --no-save` at home dir; unique port per run).
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

Any hit = build void regardless of visual match. Delete, rebuild native, restart verify. **Sole whitelist:** snippet logged in registry.md `## Custom-Code-Exceptions` (user-authorized `/custom-code-once`) — exact match only, never "similar."

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

## 3. Visual compare

Automated (primary): reference vs built snapshot, scan order §0. Human (secondary): ask user to confirm in Designer; mismatch → exact location → targeted diff. No Designer open = unconfirmed, never accept bare "looks good." Visual catches what diff misses: font rendering, color profile, image quality, balance, shadow softness, gradient smoothness.

## 4. Fix pass (batched)

Collect ALL diffs → ONE batched fix call → re-check changed items + 3-5 neighbors. Max 2 passes. Recurring diff after 2 = wrong property name/format for Webflow — fix format, not value. New diff introduced → revert, alternative approach. Priority: CRITICAL → MAJOR → MINOR → COSMETIC (skip if budget spent).

Can't close: unsupported property → impossible_cases.md + alternative · API can't set → pending_designer_work.md · value right but visual wrong → Webflow rendering bug, flag to user.

## 5. Match report (mandatory, every section)

```
PIXEL-VERIFY — [section]  tier: LIGHT|FULL  fix passes: N/2
NATIVE       ✓ 0 embeds/custom code/style-attrs, element_builder only
STRUCTURE    ✓ N/N elements, classes, exact copy, order
PROPERTIES   ✓ N/N → fixed: [list] · remaining: [list or none]
VISUAL       ✓ automated PASS | human confirmed/unconfirmed
IMPOSSIBLE   none | [list + native alternative]
VERDICT      PASS → responsive-pass | PARTIAL → user decision | FAIL → rebuild
```

NATIVE line first, must be clean — embed/style-attr never reaches PASS. Only PASS (or accepted PARTIAL) proceeds. Append summary to build_state.json `verification_reports`.

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
