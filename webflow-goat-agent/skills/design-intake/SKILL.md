---
name: design-intake
description: What to pull from a Figma file or screenshot BEFORE building in Webflow, so the result is pixel-perfect — render-first study, cache fast-path, full property capture, responsive-frame hunt, assets, validation, content fidelity, spec format. HTML deliveries load `html-intake` instead; live URLs load `url-intake`. Use at the start of any design→Webflow build EXCEPT live-URL references (those use url-intake instead — do not load this file for URL sources).
---

# Design Intake

Capture every value the build needs — guessing ≠ pixel-perfect. Once per section, before building. The spec produced here is pixel-verify's diff checklist — incomplete spec = blind verification.

## R. RENDER FIRST (before extracting any values — every source)

**The reference render is ground truth; JSON/computed values are only measurements.** Before extracting, LOOK at the section's reference image (Figma: `04-screenshots/{section}.png` from cache, or export node PNG `api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png`; screenshot: the image itself; URL: ref-cache shot). List every visual feature values may hide, and put each in the spec explicitly:
- Per-character/word colors + gradients inside one text node (Figma `styleOverrideTable` — flat extraction reports these as one solid color; verified failure: gradient H1 read as "solid white")
- Backdrop blur, layered/stacked shadows, opacity stacks
- Element overlaps / negative-margin visual effects
- True text wrap points + line counts
- Blend effects, image treatments (duotone, overlay tints)

Cross-check: every feature visible in the render must exist in the extracted spec — missing = extract deeper (node children, `styleOverrideTable`), never build without it. pixel-verify re-checks each flagged feature explicitly.

**Native-module map check (same moment):** identify each UI pattern in the render → its native Webflow module (slider/carousel → Slider · tabs → Tabs · accordion/menu → Dropdown · gallery/zoom → Lightbox · video → Video/YouTube · vector anim → Lottie · quote → Blockquote · list → List · nav → Navbar · form → Form). Record in spec `elements:`. Div-imitation of an available native module = banned (agent rule NATIVE MODULE FIRST).

## A.0 COMPILE, DO NOT TRANSCRIBE (v1.11.0 — do this before writing any spec by hand)

Figma source, cached node in hand:

```
node "$WF/scripts/figma-parse.js"   03-nodes/<node>.dc.jsx    --out=03-nodes/<node>.parsed.json
node "$WF/scripts/figma-compile.js" 03-nodes/<node>.parsed.json --prefix=<block> --section-tag      --out-plan=03-nodes/<node>.plan.json --out-contract=specs/<section>.contract.json
node "$WF/scripts/wf-preflight.js"  03-nodes/<node>.plan.json
```

That produces, from ONE source and therefore consistent by construction:
- **classes** with every shorthand already expanded to longhand (`gap`→`grid-row-gap`+`grid-column-gap`, `rounded`→4 corners, `p`→4 sides) — the leak that silently voids values in the Custom Properties panel
- **the element tree** with Figma's positioning model PRESERVED. An absolute child stays absolute. Reinterpreting absolute children as a flex column is what moved a brand block 66px off, and a column anchored by `left` centres on its widest child, not the design's axis
- **the property contract** for `dom-contract.js` — free, and derived from the same numbers as the build, so the gate can never drift from the plan
- **the asset list** to upload
- **a DECISIONS list** — Figma fill idioms (`width:min-content`), rotations that must be baked into the asset, and native-module hints from layer names. These are the only things left for judgment. Resolve them explicitly; never guess one.

Hand-writing the spec is now the FALLBACK (screenshot sources, and HTML/URL which have their own skills). Where a compiler run is possible, a hand-typed value is a defect waiting to happen — every accuracy bug worth naming in the 2026-07-31 session came from that path, not from the build tools.

Element-type choices the compiler makes for you, each for a measured reason: text nodes become **Paragraph/Heading, never TextBlock** (`set_text` is silently ignored on TextBlock, which is created as a plain `Block`); layers whose names look like a native module raise a hint rather than quietly becoming a div, because div-imitating an available module is a ban-sweep failure.

## F. Figma cache (FAST PATH — check first)

Read `$WF/sites/<site-id>/figma-cache/00-manifest.json` (`WF="$HOME/docs/memory/webflow"`; per site since v1.9.0). `status: "partial"` → the manifest lists what is actually cached: anything not in `nodes[]` is a MISS, fetch it live and update the manifest in the same pass. `status: "cached"` → use cache, ZERO Figma calls. Missing/empty → live path (§A).

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
**A.8** **Constraints/responsive** — pins/stretch; rotation, z-index, mix-blend, visibility. **MANDATORY RESPONSIVE-FRAME HUNT (never skip, never assume "desktop only"):** before building, search the file for this section's tablet/mobile counterparts — ① sibling/nearby frames whose name contains `mobile|Mobile|tablet|Tablet|sm|md|375|390|414|428|768|834|iPhone|iPad` ② frames with `absoluteBoundingBox.width` in 320-480 (mobile) / 700-900 (tablet) ③ a mobile PAGE in the file (check page list once) ④ variant of the same component with a breakpoint property. Found → cache each as `03-nodes/{section}--mobile.json` + `04-screenshots/{section}--mobile.png` and extract ALL properties (padding ×4, gaps, margins, alignment, order, font sizes, widths, hidden/shown elements, image crops) — these are exact, never derived. Not found after the hunt → record `responsive: none in design → derived` and say so in the report. Guessing mobile values while a mobile frame exists in the file = build failure.
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

## C. HTML/CSS delivery → STOP, load `html-intake` (own skill, v1.8.0)

Full-source review, effect + library sweep, exact timing capture, reference run (state shots + motion fingerprint) and the numbered manifest all live in `html-intake` (§C.0-C.6 there). Do not rebuild that procedure from memory, and do not load it on Figma/screenshot builds.

## U. Live URL → STOP, load `url-intake` (own skill, own cache). Nothing further here.

## CF. Content fidelity — real content only, zero placeholders

**Every string, number, label and image in the build comes from the source.** No lorem ipsum, no "Heading", no "Button Text", no stock swap-ins, no invented microcopy, no truncation, no "…" shortening, no re-worded headlines, no reordered list items. Applies to visually-hidden text too (alt text, aria-labels, form labels, button labels, nav items, legal lines, badge/eyebrow text).

Capture per section: every text node verbatim (incl. punctuation, casing, `&`/`—`, line breaks, superscripts) into the spec `elements:` rows · every image/icon exported and uploaded (never hotlink, never substitute) · alt text from the design/HTML, else a real description of that specific image.

Source genuinely has no content for a slot (empty Figma placeholder, `TODO` in HTML) → ask once, list it in `unknowns`, and build only after the user supplies it or explicitly says "use placeholder here". Placeholder text the agent invented on its own = pixel-verify instant FAIL (pixel-verify § Content gate).

## D. Assets — always

Export every SVG/image from Figma (or user files). Never redraw an existing SVG; never hotlink. Upload via `asset_tool` → use returned asset id in native Image + real alt. SVG containing `<foreignObject>`/`<script>`/`<style>` → strip or ask clean version. Prefer WebP photos, SVG icons/logos; JPEG/PNG source → note color-accuracy artifacts.

## E. Validation checkpoint — before spec

1. **Fonts:** every family in Webflow or user confirms install/fallback. Never build unvalidated
2. **Colors:** valid format; out-of-sRGB → flag; text/bg contrast <4.5:1 → warn, <3:1 → error
3. **Spacing:** numeric px; <2px or >500px → confirm
4. **Elements:** every type in build-reference node table
5. **Impossible scan:** rotation, blend beyond multiply/screen/overlay, scroll-snap, 3D → impossible_cases.md + alternative
6. **Description-source completeness:** structure, palette, typography, layout, copy, image descriptions — missing critical → ask

## Output — working spec, WRITTEN TO DISK (v1.10.0)

**Save it: `$WF/sites/<site-id>/specs/<section>.md`.** It used to be an in-context note, which cost accuracy and money at once: the diff target lived only in conversation memory, so a crash lost it, a long session let it drift, and the pipeline could never be split across sessions. On disk it is the *contract* — pixel-verify §2 diffs against the file, not a recollection, and a fresh session can build or verify a section with no history at all.

Write it once at the end of intake, then update the `effects:` row statuses in place as they resolve. Anything the build discovers that the spec did not capture (a hidden state, a second image, a wrap point) is appended to the file in the same pass it is found — a spec that no longer matches what shipped is a broken contract, not a stale note.

```
SECTION: [name]              source: figma node X | screenshot | html
layout: flex-col|flex-row|grid(N) · gap X · padding T R B L · align/justify
elements:
  1 H1  "exact copy"  family/size/weight/lh/ls/color  [font-validated]
  2 img [asset → uploaded id]  w×h, radius, object-fit
colors: var(--x) | #hex (new → propose var) · gradients stops+angle
effects:   [NUMBERED manifest — E1…En, each: type · target · exact values (incl. duration/delay/easing/iteration) · tier T1-T4 · status]
           (static shadows/blurs/borders per element included as T1 rows)
reference-run: [HTML/URL sources] state shots: [paths, states captured] · motion fingerprint: [path] · computed CSS: [path]
               | reference-not-run: [reason]
assets: [uploaded list — each: file, asset id, viewBox ✓, baked color, class size]
interactions: [list | none]
responsive: mobile-frame: [node id | NONE after hunt] · tablet-frame: [node id | NONE]
           [exact per-breakpoint values from those frames | derived + flagged]
impossible: [list + alternatives | none]
unknowns: [assumed values + confidence — confirm before build]
validation: fonts|colors|spacing|elements|content-verbatim|svg-preflight|effect-manifest ✓
```

`unknowns` non-empty + matters → ask before building. Any validation failed → fix first.
