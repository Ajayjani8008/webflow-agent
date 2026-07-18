---
name: design-intake
description: What to pull from a Figma file, screenshot, or pasted HTML BEFORE building in Webflow, so the result is pixel-perfect. Use at the start of any design→Webflow build EXCEPT live-URL references (those use url-intake instead — do not load this file for URL sources).
---

# Design Intake

Goal: capture every value the build needs so nothing gets guessed. Guessing = not pixel-perfect. Run once per section before building it. The spec produced here is also the checklist `pixel-verify` diffs against after the build — be complete, or verification is blind.

## F — Figma Cache (FAST PATH — use if available)

**Before any Figma MCP/API calls, check if cache exists:**

1. Read `docs/memory/figma-cache/00-manifest.json`
2. If `status: "cached"` → **use cache, skip all Figma reads**
3. If `status: "empty"` or file missing → no cache, use normal Figma path (section A)

**Cache read process (instant — zero Figma API calls):**

```
Section data:   docs/memory/figma-cache/03-nodes/{section-name}.json
Tokens:         docs/memory/figma-cache/07-tokens.json
Screenshot:     docs/memory/figma-cache/04-screenshots/{section-name}.png
Assets:         docs/memory/figma-cache/05-assets/
Components:     docs/memory/figma-cache/06-components.json
Build queue:    docs/memory/figma-cache/08-build-queue.json
```

**From cache, extract per section:**
- All CSS properties (layout, typography, color, spacing, effects, borders, radius)
- All text content (exact copy)
- All asset references (image paths)
- All component relationships (Symbol/CMS candidates)
- Screenshot for visual verification

**Cache validation:**
- If section name not in cache → section was added after cache was built → re-run `/figma-setup`
- If cache data seems incomplete (missing properties) → warn user, offer to re-cache
- If user edited Figma after caching → cache may be stale → warn "Figma may have changed since cache, re-run /figma-setup if needed"

**Cache → spec mapping:**
```json
{
  "source": "figma-cache",
  "section_name": "hero",
  "node_id": "123:456",
  "layout": { /* from cache node data */ },
  "elements": [ /* from cache children */ ],
  "tokens": { /* from cache tokens */ },
  "screenshot": "figma-cache/04-screenshots/hero.png"
}
```

**This is the same spec format as non-cached Figma** — downstream skills (pixel-verify, responsive-pass) don't know or care if data came from cache or live Figma. Uniform interface.

## A. Source — Figma (figma.com URL / node) — LIVE PATH (no cache)

**Use this path only when cache is NOT available.** If cache exists, use section F above.

Read via Figma MCP. Do NOT eyeball, do not dump the full tree — `get_metadata` once for the section map, `get_variable_defs` once for tokens, then `get_design_context` on each section's node id (it returns CSS-ready properties + text, like an inspector). No MCP → Figma REST with `FIGMA_TOKEN`, one node per request.

**NODE-FIRST — never dump the page root.** When you already have a section node id (from the URL or a prior map), go STRAIGHT to `get_design_context` on that node. NEVER call `get_metadata` on the page root (`0:1`) or a whole top-level page frame to "find" a section — a full page can return ~1MB (950K chars observed) and blows the token budget. If the given node turns out to be only a sub-layer (e.g. a bare background container with no children/text), climb ONE level at a time: `get_metadata` on the immediate parent frame only, never the page root. Use `get_metadata` for structure discovery solely on the smallest frame that could contain what you need.

**Pre-flight validation (before capture):**
1. Confirm Figma URL is valid and node exists — `get_metadata` returns data or error
2. Check node type against build-reference mapping table — unsupported node types flagged before capture
3. Verify font family exists in Webflow library (`data_fonts_tool` check) — mismatch = ask user to confirm fallback

Per section, capture — **all properties, no shortcuts:**

1. **Frame / layout** — auto-layout direction (H/V), gap, padding (all 4 sides), alignment (primary + counter axis), width mode (fill/hug/fixed), max-width, wrap, **min-width, min-height, overflow, clip-content, layout-positioning (absolute within flex)**
2. **Spacing** — exact px between every element; section outer padding top/bottom. **Include negative margins, overlapping elements**
3. **Typography** — per text node: font family, weight, size, line-height, letter-spacing, color, text-align, transform (uppercase/lowercase/capitalize?), decoration (underline/strike-through?), **text-case, paragraph-indent, paragraph-spacing, hanging-punctuation**
4. **Color** — every fill/stroke as hex/rgba. Gradients: type (linear/radial), stops (color + position 0-1), angle. Opacity. **Blend modes (multiply, overlay, screen, etc.), isolation, background-blend-mode**
5. **Radius** — corner radius per element; per-corner if uneven. **Ellipse → border-radius: 50%**
6. **Shadow / effects** — x, y, blur, spread, color, inner/outer. Layer blur, backdrop blur. **Effect visibility toggle, effect blend mode**
7. **Borders** — width, style, color, per side if uneven. **Border align (inside/center/outside)**
8. **Constraints / responsive** — pin/stretch constraints; **rotation angle, z-index, mix-blend-mode, opacity, visibility**. If tablet/mobile frames exist, read their values too (never invent responsive behavior when the design specifies it)
9. **Images / icons** — every image and SVG; decorative vs content; export node ids. **Image fill mode (fill/fit/crop/tile), crop rectangle, image transforms**
10. **Components / variants** — repeated instances (Symbol candidates ≥2×, CMS candidates ≥3× editorial), variant states (hover/active/open). **Component properties (boolean, instance swap, text), default overrides**
11. **Interactions** — prototype links, hover-state variants, transitions noted in the file. **Animation type (move/rotate/scale/fade), easing, duration, trigger (on click/hover/while pressed/delay)**
12. **Text-specific extras** — **OpenType features (liga, kern, onum, etc.), text decoration color/style, text emphasis, link styles within text**
13. **Transform** — **rotation, skew, scale transforms** — document degrees/percentages. Note: rotation has no direct Webflow CSS equivalent → flag as impossible case

**Figma property → Webflow property mapping (catch mismatches early):**

| Figma Property | Webflow Equivalent | Notes |
|---|---|---|
| `blendMode` | `mix-blend-mode` | LIMITED support: multiply, screen, overlay only. Others → impossible |
| `rotation` | None native | Flag as impossible. CSS transform rotate = custom code |
| `effects[].type: LAYER_BLUR` | `filter: blur()` | Supported |
| `effects[].type: BACKGROUND_BLUR` | `backdrop-filter: blur()` | Supported |
| `clipContent` | `overflow: hidden` | Supported |
| `constraints` | CSS positioning | Partial: left/right/top/bottom pinning maps to absolute positioning |
| `layoutGrids` | CSS Grid | Only if grid matches CSS Grid spec. Figma auto-layout → flex preferred |
| `textAutoResize` | Intrinsic sizing | HEIGHT auto-resize → `height: auto`. WIDTH → `width: fit-content` |
| `opacity` | `opacity` | Direct map |
| `visible` | `display: none/flex/block` | Direct map |

## B. Source — Screenshot only (no Figma access)

Exact values don't exist — extract what's measurable, flag the rest with **mandatory confidence levels**:

1. **Read from pixels (HIGH confidence):** layout structure, column count, proportions, relative alignment, image boundaries
2. **Read from pixels (MEDIUM confidence):** colors (sample hex from image — note: JPEG compression introduces ±5 color shift), probable font family (match by x-height/ascender shape), relative type scale (ratios, not absolute px)
3. **Read from pixels (LOW confidence — cannot know precisely):** exact px spacing, font weight/line-height/letter-spacing, hover/scroll behavior, breakpoint behavior, real asset files (raster, low-res), border widths < 2px, shadow spread values, small radius values
4. **Ask the user for (required before build):**
   - Font family/file if unclear — **validate exists in Webflow** via `data_fonts_tool` or confirm user will install
   - Brand hex codes (exact values, not sampled)
   - High-res assets / logo SVG
   - Interaction intent (hover effects, scroll reveals, transitions)
   - Target breakpoints (or confirm default)
   - Section spacing intent (padding/margin values)
5. **State every assumption explicitly** with confidence tag: `assuming 24px gap [MEDIUM]`, `assuming 600 weight [LOW]` in `unknowns` so the user corrects before build. **Any MEDIUM/LOW assumption that affects layout requires explicit user confirmation** — text-only MEDIUM assumptions can proceed if user doesn't respond after reminder.

**Screenshot accuracy mitigation:**
- If image is < 1200px wide: flag as low-res, ask for higher resolution
- If image has text: ask for actual copy + font info (don't OCR from low-res)
- If image has gradients: flag as uncertain stops/angle, ask for design tokens
- Sample colors from **solid areas only** — avoid anti-aliased edges, gradients, shadows
- For fonts: compare **character shapes** (a, g, y, R, Q) to known font samples — never guess decorative fonts

## C. Source — Pasted HTML/CSS

Treat as ground truth, never as embed material:

1. Map each tag to its native Webflow element (see build-reference mapping); the DOM structure is the element tree
2. Computed/declared CSS values → class styles, exactly (colors, spacing, type, shadows, radius)
3. CSS custom properties in the source → Webflow variables of the same role
4. `@media` rules → breakpoint overrides for responsive-pass
5. Anything script-driven → map to a native equivalent (IX2, native slider/tabs/dropdown, class :hover) or tell the user it's out of native scope. The pasted `<script>`/`<style>` NEVER enters the site in any form — custom code is banned with zero exceptions
6. **Property validation:** check each CSS property against Webflow-supported properties:
   - ✅ Supported: all layout, typography, color, spacing, border, shadow, transform (translate/scale only), transition
   - ⚠️ Partial: `clip-path` (basic shapes only), `filter` (blur/grayscale/opacity only), `backdrop-filter` (blur only)
   - ❌ Not supported: `scroll-snap-type`, `scroll-behavior`, `overscroll-behavior`, `contain`, `container-type`, `@layer`, `@scope`, CSS nesting, `color-mix()`, `light-dark()`, `@property`
   - Unsupported properties → log in `pending_designer_work.md` as "needs manual in Designer" with closest native alternative

## U. Source — Live website URL

Design source is a live site URL → STOP here, load `Skill: url-intake` instead (own skill, own cache). Do not read further URL details in this file — none exist.

## D. Assets — always

- Export every SVG icon and image from Figma (or get files from the user). Never redraw an icon that exists as SVG; never hotlink external URLs
- Upload via `asset_tool`; use the returned URL in native Image elements. Pair each image with real alt text
- **SVG validation:** if SVG contains `<foreignObject>`, `<script>`, or `<style>` → strip before upload or ask user for clean version
- **Image format:** prefer WebP for photos, SVG for icons/logos. If source is JPEG/PNG: note compression artifacts may affect color accuracy

## E. Validation checkpoint — always

Before producing the spec, run these checks:

1. **Font validation:** every font family → check exists in Webflow (`data_fonts_tool` list). Missing → ask user to install or confirm fallback. Never build with unvalidated font
2. **Color validation:** every hex/rgba → confirm valid format. Out of sRGB gamut → flag. **Contrast check:** if text + background colors both known → calculate ratio. < 4.5:1 → warn. < 3:1 → error
3. **Spacing validation:** all values → confirm numeric px. Extreme (< 2px or > 500px) → confirm with user
4. **Element validation:** every planned type → confirm in build-reference node table. Unknown → flag
5. **Impossible cases check:** scan for rotation, blend modes beyond multiply/screen/overlay, scroll-snap, 3D transforms → log in impossible_cases.md with native alternative
6. **Description completeness** (text description source only): require page structure, color palette, typography, layout style, content copy, image descriptions. Missing critical info → ask, don't guess

## F. Output — the working spec (per section)

Keep it tight — a working note in context, not a document saved to disk:

```
SECTION: [name]                    source: figma node X | screenshot | html
layout: flex-col | flex-row | grid(cols=N) · gap X · padding T R B L · align/justify
elements:
  1 H1   "exact copy"   family/size/weight/lh/ls/color  [font-validated: yes/no]
  2 p    "exact copy"   ...
  3 img  [asset → uploaded URL]  w×h, radius, object-fit
colors: var(--x) | #hex (new → propose var) · gradients with stops+angle  [all-validated: yes]
effects: shadows / blurs / borders per element
assets: [icon.svg → uploaded, hero.jpg → uploaded]
interactions: [hover lift, scroll reveal] or none
responsive: [tablet/mobile values read from design] or [none in design → standard patterns, flagged]
impossible: [list any elements that can't be built natively, with alternatives offered]
unknowns: [every assumed value with confidence level — confirm before build]
validation: fonts-validated | colors-validated | spacing-validated | elements-validated
```

If `unknowns` is non-empty and any of them matter for pixel-perfect → ask before building. Do not invent. **If any validation check failed → fix before building** — don't proceed with known invalid values.
