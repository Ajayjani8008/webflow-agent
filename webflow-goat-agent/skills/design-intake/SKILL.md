---
name: design-intake
description: What to pull from a Figma file, screenshot, or pasted HTML BEFORE building in Webflow, so the result is pixel-perfect. Use at the start of any design→Webflow build EXCEPT live-URL references (those use url-intake instead — do not load this file for URL sources).
---

# Design Intake

Capture every value the build needs — guessing ≠ pixel-perfect. Once per section, before building. The spec produced here is pixel-verify's diff checklist — incomplete spec = blind verification.

## F. Figma cache (FAST PATH — check first)

Read `docs/memory/figma-cache/00-manifest.json`. `status: "cached"` → use cache, ZERO Figma calls. Missing/empty → live path (§A).

Reads: `03-nodes/{section}.json` (props, text, children) · `07-tokens.json` · `04-screenshots/{section}.png` · `05-assets/` · `06-components.json` · `08-build-queue.json`.

Validation: section not in cache → fetch on demand (cache-on-fetch) · data incomplete → warn, offer re-cache · user edited Figma after caching → warn stale.

Output = same spec format as live path — downstream skills don't care about the source.

## A. Figma LIVE path (no cache only)

`get_metadata` once for section map, `get_variable_defs` once for tokens, `get_design_context` per section node (CSS-ready). No MCP → Figma REST with `FIGMA_TOKEN`, one node/request.

**NODE-FIRST — never dump page root.** Node id in hand → straight to `get_design_context`. NEVER `get_metadata` on page root (`0:1`) or whole page frame (~1MB observed — blows budget). Node is bare sub-layer → climb ONE parent at a time. `get_metadata` only on the smallest containing frame.

**Pre-flight:** URL/node valid · node type in build-reference table · font families exist in Webflow (`data_fonts_tool`) — mismatch → ask fallback.

**Capture per section — all properties:**
1. **Frame/layout** — auto-layout direction, gap, padding ×4, alignment both axes, width mode (fill/hug/fixed), max-width, wrap, min-w/h, overflow, clip, absolute-in-flex
2. **Spacing** — exact px between every element; section outer padding; negative margins/overlaps
3. **Typography** — per text node: family, weight, size, line-height, letter-spacing, color, align, transform, decoration, paragraph indent/spacing
4. **Color** — every fill/stroke hex/rgba; gradients (type, stops+position, angle); opacity; blend modes
5. **Radius** — per element, per-corner if uneven; ellipse → 50%
6. **Effects** — shadow x/y/blur/spread/color inner/outer; layer blur; backdrop blur; visibility toggles
7. **Borders** — width/style/color, per side; border align
8. **Constraints/responsive** — pins/stretch; rotation, z-index, mix-blend, visibility; tablet/mobile frames → read their values (never invent specified responsive)
9. **Images/icons** — every image + SVG; decorative vs content; export node ids; fill mode, crop
10. **Components/variants** — repeats (Symbol ≥2×, CMS ≥3× editorial); variant states (hover/active/open); component props
11. **Interactions** — prototype links, hover variants, transitions (type, easing, duration, trigger)
12. **Transforms** — rotation/skew/scale — document; rotation/skew = impossible case, flag

**Mapping mismatch early-catch:** `blendMode`→`mix-blend-mode` (multiply/screen/overlay ONLY) · `rotation`→NONE (impossible) · LAYER_BLUR→`filter: blur()` · BACKGROUND_BLUR→`backdrop-filter: blur()` · `clipContent`→`overflow: hidden` · constraints→absolute pinning (partial) · textAutoResize HEIGHT→`height:auto`, WIDTH→`width:fit-content`. Full table: build-reference.

## B. Screenshot only

Extract measurable, flag rest with mandatory confidence:
- **HIGH:** layout structure, column count, proportions, alignment, image boundaries
- **MEDIUM:** sampled colors (JPEG ±5 shift — sample solid areas only, never anti-aliased edges/gradients), probable font family (compare a/g/y/R/Q shapes — never guess decorative), relative type scale
- **LOW (can't know):** exact spacing px, weight/line-height/letter-spacing, hover/scroll behavior, breakpoints, borders <2px, shadow spread, small radii
- **Ask user (required before build):** font family (validate in Webflow or user installs) · brand hex codes · high-res assets/logo SVG · interaction intent · breakpoints · section spacing intent

Every assumption tagged: `assuming 24px gap [MEDIUM]` → `unknowns`. **MEDIUM/LOW affecting layout = explicit user confirmation required**; text-only MEDIUM proceeds after one reminder. Image <1200px wide → ask higher res. Text in image → ask actual copy, don't OCR low-res. Gradients → ask tokens.

## C. Pasted HTML/CSS

Ground truth, never embed material:
1. Tag → native Webflow element (build-reference table); DOM = element tree
2. CSS values → class styles exactly
3. CSS custom properties → Webflow variables, same role
4. `@media` → breakpoint overrides for responsive-pass
5. Script-driven → native equivalent (IX2, native slider/tabs/dropdown, `:hover`) or out-of-scope; pasted `<script>`/`<style>` NEVER enters the site
6. Property support check: ✅ layout/type/color/spacing/border/shadow/transform(translate,scale)/transition · ⚠️ clip-path (basic), filter (blur/grayscale/opacity), backdrop-filter (blur) · ❌ scroll-snap, scroll-behavior, overscroll-behavior, contain, container-type, @layer, @scope, nesting, color-mix(), light-dark(), @property → ledger + nearest native alternative

## U. Live URL → STOP, load `url-intake` (own skill, own cache). Nothing further here.

## D. Assets — always

Export every SVG/image from Figma (or user files). Never redraw an existing SVG; never hotlink. Upload via `asset_tool` → use returned asset id in native Image + real alt. SVG containing `<foreignObject>`/`<script>`/`<style>` → strip or ask clean version. Prefer WebP photos, SVG icons/logos; JPEG/PNG source → note color-accuracy artifacts.

## E. Validation checkpoint — before spec

1. **Fonts:** every family in Webflow or user confirms install/fallback. Never build unvalidated
2. **Colors:** valid format; out-of-sRGB → flag; text/bg contrast <4.5:1 → warn, <3:1 → error
3. **Spacing:** numeric px; <2px or >500px → confirm
4. **Elements:** every type in build-reference node table
5. **Impossible scan:** rotation, blend beyond multiply/screen/overlay, scroll-snap, 3D → impossible_cases.md + alternative
6. **Description-source completeness:** structure, palette, typography, layout, copy, image descriptions — missing critical → ask

## Output — working spec (per section, in-context note, not saved doc)

```
SECTION: [name]              source: figma node X | screenshot | html
layout: flex-col|flex-row|grid(N) · gap X · padding T R B L · align/justify
elements:
  1 H1  "exact copy"  family/size/weight/lh/ls/color  [font-validated]
  2 img [asset → uploaded id]  w×h, radius, object-fit
colors: var(--x) | #hex (new → propose var) · gradients stops+angle
effects: shadows/blurs/borders per element
assets: [uploaded list]
interactions: [list | none]
responsive: [values from design | none → standard patterns, flagged]
impossible: [list + alternatives | none]
unknowns: [assumed values + confidence — confirm before build]
validation: fonts|colors|spacing|elements ✓
```

`unknowns` non-empty + matters → ask before building. Any validation failed → fix first.
