---
name: pixel-verify
description: Mandatory verification loop after building each Webflow section — automated screenshot capture, DOM read-back, property diff against the intake spec, visual compare against the source, one batched fix pass. A section is not done until this passes. This is the accuracy engine.
---

# Pixel Verify

Run after every section build, before responsive-pass. Never skipped, never replaced by "it should be right". Budget: 1 verify + max 2 fix passes; still failing → report remaining diffs honestly, do not loop. **Automated comparison is primary evidence — human confirmation is secondary validation.**

## 0. Automated screenshot capture (NEW — the missing link)

**Before any comparison, capture evidence:**

1. Use `designer_tool` → `select_element` on the built section
2. Capture screenshot of built section via `element_snapshot_tool` or ask user for Designer screenshot
3. Get reference screenshot: Figma `get_screenshot` on section node, or original reference image
4. **Both screenshots must exist** before proceeding — no screenshots = verification is blind

**`element_snapshot_tool` DOES NOT LOAD CUSTOM WEB FONTS (verified 2026-07-12).** It renders any site custom font (e.g. an installed Inter) as a **serif/browser fallback** — a huge extra-bold H1 comes back looking like mangled Times with broken letter-spacing. This is a snapshot artifact, NOT a real bug. Before "fixing" a font mismatch: confirm the font IS installed (`data_fonts_tool list_fonts`) and the class `font-family` is correct — if both are right, the serif is the tool lying. **Never restyle typography off the snapshot alone.** Confirm typography (and anything font-metric-dependent: wrapping, line count, overflow) against the PUBLISHED page.

**PUBLISH ONCE — not per check (token + time discipline).** Publishing is slow (~10-20s) and every publish + headless shot costs tokens. Do NOT publish after every fix. Interim verification uses `element_snapshot_tool` (free, instant) for layout/structure/color/positioning. Batch ALL fixes, THEN publish once for the final typography + responsive sign-off (desktop + the breakpoints in one publish). Re-publish only if that final pass finds a real defect to fix.

**Published-page render = the real primary evidence** for typography, true responsive, and final sign-off. Publish (`publish_site` to the webflow.io subdomain) then screenshot the live URL with the reusable script `docs/memory/shot-el.js` (element-clip, defeats Webflow's load-animation opacity:0):
- `node docs/memory/shot-el.js <url> <out.png> <W> "<cssSelector>" <mobile:1|0> <port>` — e.g. desktop `... 1440 ".partner-hero" 0 9247`, mobile `... 390 ".partner-hero" 1 9248` (unique port each run). Needs `ws` (`npm i ws --no-save` at the home directory — any OS).
- **Clip to the element's bounding box, NOT `{x:0,y:0}`.** CDP `Page.captureScreenshot` `clip` is in PAGE-origin CSS px, not the viewport — a fixed `y:0` clip captures the page TOP (often a blank/load-animated area) and returns a near-white image, no matter how you scroll. shot-el.js reads the target's `getBoundingClientRect().top + scrollY` and clips there with `captureBeyondViewport:true`. A ~5-6KB output PNG = blank capture → wrong clip or unpublished/opacity-hidden page.
- **Mobile/tablet: `--window-size=390` does NOT set the layout viewport** — Chrome renders wider then crops (false "no overflow", wrong breakpoint). shot-el.js uses CDP `Emulation.setDeviceMetricsOverride {width,height,deviceScaleFactor:2,mobile:true}` with ws header `Origin: http://localhost` and an ABSOLUTE `--user-data-dir` (relative → "requires a non-default data directory"). See memory [[webflow-mcp-gotchas]].

**Screenshot comparison methodology:**
- Side-by-side visual comparison (built vs reference)
- Scan order: overall proportions → layout grid → spacing rhythm → alignment edges → type hierarchy → color blocks → corner radii → shadows → asset crops
- **Quantify where possible:** count visible elements, measure relative spacing ratios, check color blocks against reference
- **Flag specific mismatches** with location: "hero__title appears 10px lower than reference", "card gap looks wider in built version"

## 1. Structure read-back (evidence, not attestation)

**POST-BATCH COUNT CHECK — run immediately after EVERY `data_element_builder` call, not just at final verify.** `element_builder` can silently duplicate a whole subtree (e.g. a slow/retried bridge call created a second full content block, contiguous id range — caught only at final pixel-verify, wasting a full verify cycle). After each build batch: `query_elements`/`get_all_elements` (depth 1-2) on the section and confirm the direct child count equals what you just built (e.g. section → exactly [ticker, content]; content → exactly [left, orbit]). Duplicate or orphan → `remove_element` the extra NOW, before styling/verify. Cheap query, saves an expensive round-trip.

MCP mode: `element_snapshot_tool` on the built section (or `data_element_tool` get). API mode: `GET /v2/pages/{id}/dom`.

Check against the intake spec:
- [ ] Every spec element exists — right node type (heading h-level, paragraph, image, link-block, native slider/tabs/form…)
- [ ] Every element carries its planned classes (combo = base + modifier both present)
- [ ] Text content is the exact copy from the spec — character-for-character (including punctuation, whitespace, line breaks)
- [ ] Image elements point at the uploaded asset URLs, real alt text
- [ ] Nesting matches the spec layout (no orphaned or duplicate wrappers)
- [ ] **Element count matches spec** — no extra wrapper divs, no missing elements
- [ ] **Element order matches spec** — visual order matches source

**Ban-compliance sweep (instant FAIL — no fix pass, rebuild natively):**
- [ ] Zero html-embed / HtmlEmbed / CodeBlock nodes in the section
- [ ] Zero `<style>` / `<script>` / inline `style=` anywhere in the DOM read-back
- [ ] **Custom Properties / Custom Attributes panel (`xattr`) carries NO CSS** — zero `margin`, `padding`, `display`, `gap`, `width`, `height`, `color`, `font-*`, `border*`, `radius`, `position`, `overflow`, etc. Any CSS-named custom property = void; that value belongs on a class via `data_style_tool`. Attributes are semantics only (href, alt, id, aria-*, type, placeholder, role, CMS bindings). Includes zero/default resets like `margin: 0px` — delete, don't keep.
- [ ] Section was built via `data_element_builder`, not `data_whtml_builder`
- [ ] **No data-* attributes used for styling** (only standard HTML attributes)

Any hit here = the build is void regardless of visual match. Delete the offending nodes, rebuild that part with native elements + class styles, then restart verification.

**Sole whitelist:** a snippet logged in registry.md `## Custom-Code-Exceptions` (user-authorized via `/custom-code-once`) is the ONLY allowed hit — match it exactly (page/element/type from the log entry). Anything not in that log fails as usual; the whitelist never extends to "similar" code.

## 2. Property diff (the core step — with false-positive prevention)

For each class in the section, read back its applied styles (`data_style_tool` get / the snapshot's style data) and diff against the spec value-by-value:

| Check | Spec | Applied | Pass |
|---|---|---|---|
| font-family / font-weight | | | |
| font-size / line-height / letter-spacing | | | |
| color / background-color | | | |
| background-image (gradient stops + angle) | | | |
| display / flex-direction / flex-wrap | | | |
| justify-content / align-items / align-self | | | |
| gap | | | |
| padding (all 4: top right bottom left) | | | |
| margin (all 4: top right bottom left) | | | |
| width / max-width / min-width / height | | | |
| border-radius (all 4 corners) | | | |
| border (width / style / color per side) | | | |
| box-shadow (x / y / blur / spread / color / inset) | | | |
| opacity | | | |
| filter (blur value) | | | |
| object-fit / object-position | | | |
| position / top / right / bottom / left | | | |
| z-index | | | |
| overflow | | | |
| text-align / text-decoration / text-transform | | | |
| white-space / word-break / overflow-wrap | | | |

**False-positive prevention rules:**
1. **Inherited values:** if a property is absent from the applied styles but the element inherits from parent (e.g., color, font-family), check parent element — if parent has correct value, mark as PASS with note "inherited from parent"
2. **Variable resolution:** variables count as their resolved value — if spec says `var(--color-primary)` and applied is `#FF0000`, resolve the variable first and compare resolved values
3. **Webflow defaults:** some properties have Webflow defaults that differ from CSS defaults (e.g., `box-sizing: border-box` is always on). Don't flag Webflow-default values as diffs unless spec explicitly specifies different value
4. **Cascade layering:** Webflow applies styles via classes, not inline. If a property appears in a different class on the same element, verify the final computed value matches spec — the class it's in doesn't matter, the result does
5. **Rounding tolerance:** Webflow may round values (e.g., `13.333px` → `13.33px`). Tolerance: ±0.5px for lengths, ±0.01 for opacity, exact for colors and integers
6. **Gradient format:** Webflow may output gradients in different format (e.g., `linear-gradient(180deg, #000 0%, #fff 100%)` vs spec `linear-gradient(to bottom, black, white)`). Compare stops and angle, not string format
7. **Shorthand expansion:** `margin: 10px 20px` → Webflow may store as individual properties. Compare resolved values, not property names

**Diff severity levels:**
- **CRITICAL:** wrong element, wrong text, missing element, wrong layout direction → must fix
- **MAJOR:** wrong color, wrong font-size, wrong spacing > 5px, missing shadow/border → must fix
- **MINOR:** letter-spacing off by 0.5px, border-radius off by 1px, opacity 0.95 vs 1.0 → fix if time permits, flag to user
- **COSMETIC:** sub-pixel differences, anti-aliasing differences → note but don't fix

## 3. Visual compare (automated + human)

**Automated (primary):**
- Figma source: `get_screenshot` on the section node
- Screenshot/HTML source: original reference image
- Built section: `element_snapshot_tool` screenshot
- Compare all three: spec source vs built output vs reference image
- Scan: overall proportions → spacing rhythm → alignment edges → type hierarchy/wrapping → colors side-by-side → corner radii + shadows → asset crops/quality

**Human confirmation (secondary — catches what automated misses):**
- Ask user: "Can you confirm the section looks correct in your Designer?"
- User confirms or provides specific feedback
- If user reports mismatch: get exact location → run targeted property diff on that element
- **Never accept "looks good" without evidence** — if user doesn't open Designer, flag as unconfirmed

**What visual compare catches that property diff misses:**
- Font rendering differences (same font-size, different visual weight due to hinting)
- Color profile differences (sRGB vs Display P3)
- Sub-pixel rendering and anti-aliasing
- Image crop/compression quality
- Overall visual balance and rhythm
- Shadow softness/hardness perception
- Gradient smoothness

## 4. Fix pass (batched, with regression prevention)

Collect ALL diffs from steps 1–3 → fix in one batch (`data_style_tool` update / `data_element_builder` edits) → re-check only the changed items. Max 2 fix passes. A recurring diff after 2 passes usually means the property name/format is wrong for Webflow (see rule 3 in CLAUDE.md) — fix the format, not the value.

**Regression prevention:**
- After fixing, re-run the specific property checks that were failing
- Also re-check 3-5 neighboring properties that might have been affected by the fix
- If a fix introduces a NEW diff → revert that fix, try alternative approach
- Track fix history: "fixed letter-spacing in pass 1, but broke line-height — reverted, tried different approach"

**Fix priority order:**
1. CRITICAL diffs first (wrong structure, wrong text)
2. MAJOR diffs (wrong visual values)
3. MINOR diffs (close but not exact)
4. COSMETIC diffs (skip if > 2 pass budget consumed)

**When a fix can't close a diff:**
- Property not supported in Webflow → log in `impossible_cases.md` with native alternative
- Property supported but API can't set it → log in `pending_designer_work.md` as "Designer manual step"
- Value seems correct in code but visual doesn't match → possible Webflow rendering bug, document and flag to user

## 5. Match report (output every time — mandatory)

```
PIXEL-VERIFY — [section]                              fix passes used: N/2
SCREENSHOT   ✓ automated capture taken [timestamp]
NATIVE       ✓ 0 embeds, 0 custom code, 0 style-attrs, element_builder only
STRUCTURE    ✓ 12/12 elements, classes, exact copy, order matches
PROPERTIES   ✓ 41/43 → fixed: hero__title letter-spacing (1.5→2px), hero gap (24→32px)
               remaining: hero__subtitle color #333 vs #444 (Webflow rounding, ±1 channel)
VISUAL       ✓ proportions/spacing/type/color match source
               automated: PASS | human: confirmed/unconfirmed
IMPOSSIBLE   none | [list with native alternatives offered]
REGRESSION   ✓ no new diffs introduced by fixes
REMAINING    none | [diff — why it can't close + what would resolve it]
VERDICT      PASS → responsive-pass | PARTIAL → [user decision needed] | FAIL → rebuild required
```

NATIVE line must be first and must be clean — a section with an embed or style-attribute never reaches PASS.
Only PASS (or user-accepted PARTIAL) proceeds to responsive-pass. "Complete" without this report = the section is not complete.

**Report persistence:** append report summary to `build_state.json` under `verification_reports` for audit trail.

## 6. Edge cases — special handling

| Case | How to verify |
|---|---|
| **Gradient text** | Check: background-clip: text + text-fill-color: transparent + gradient background. Webflow uses class styles, not -webkit- prefixes |
| **Backdrop blur** | Check: backdrop-filter property on element. Verify blur radius matches spec |
| **Per-corner radius** | Check each corner individually: border-top-left-radius, border-top-right-radius, etc. Webflow supports per-corner |
| **Nested flex layouts** | Verify parent flex properties AND child flex properties independently |
| **Sticky elements** | Verify position: sticky + top/left offset. Note: sticky behavior requires scroll to verify |
| **Form elements** | Verify input styles separately from form layout — inputs have their own style constraints |
| **Video elements** | Verify poster image, play button overlay positioning — native video has limited styling |
| **Rich text blocks** | Verify heading/paragraph styles within richtext container — styles may cascade differently |
