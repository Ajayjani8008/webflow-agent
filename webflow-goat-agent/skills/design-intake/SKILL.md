---
name: design-intake
description: What to pull from a Figma file, screenshot, or HTML delivery BEFORE building in Webflow, so the result is pixel-perfect AND behaves like the reference (HTML path: read every css/js file, sweep libraries, run it headless for state shots + motion fingerprint). Use at the start of any design→Webflow build EXCEPT live-URL references (those use url-intake instead — do not load this file for URL sources).
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

**Native-module map check (same moment):** identify each UI pattern in the render → its native Webflow module (slider/carousel → Slider · tabs → Tabs · accordion/menu → Dropdown · gallery/zoom → Lightbox · video → Video/YouTube · vector anim → Lottie · quote → Blockquote · list → List · nav → Navbar · form → Form). Record in spec `elements:`. Div-imitation of an available native module = banned (agent Rule 4).

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
8. **Constraints/responsive** — pins/stretch; rotation, z-index, mix-blend, visibility. **MANDATORY RESPONSIVE-FRAME HUNT (never skip, never assume "desktop only"):** before building, search the file for this section's tablet/mobile counterparts — ① sibling/nearby frames whose name contains `mobile|Mobile|tablet|Tablet|sm|md|375|390|414|428|768|834|iPhone|iPad` ② frames with `absoluteBoundingBox.width` in 320-480 (mobile) / 700-900 (tablet) ③ a mobile PAGE in the file (check page list once) ④ variant of the same component with a breakpoint property. Found → cache each as `03-nodes/{section}--mobile.json` + `04-screenshots/{section}--mobile.png` and extract ALL properties (padding ×4, gaps, margins, alignment, order, font sizes, widths, hidden/shown elements, image crops) — these are exact, never derived. Not found after the hunt → record `responsive: none in design → derived` and say so in the report. Guessing mobile values while a mobile frame exists in the file = build failure.
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

## C. HTML/CSS reference — recreate it ALL, nothing simplified

The HTML file is the contract — **behaviour included, not just layout.** Every interactive and visual effect in it must exist in the Webflow build at its ladder tier (build-reference § Effect Fidelity Ladder), never dropped, never "approximated". Layout-only recreation is the #1 failure of HTML→Webflow work and is a FAIL, not a partial.

**C.0 MANDATORY FULL REVIEW — read everything before building anything (never skip, never sample)**

Reading "the HTML" means the whole delivery, not the markup file:

1. **Inventory the source tree first:** `ls -R` the reference folder; grep the HTML for `<link rel="stylesheet"`, `<script src=`, `<style`, `<svg`, `<canvas`, `<video`, `data-*` hooks, inline `on*=` handlers. List every file the page pulls in — local AND CDN.
2. **Read every local CSS and JS file end to end.** A hover rule, a `@keyframes`, or the entire scroll engine usually lives in `style.css` / `main.js`, not in the HTML. Skimming = missed effects. Files >1500 lines: read in chunks, all chunks, no sampling.
3. **CDN libraries are effects too** — resolve each to its native route (§C.2b). "It's a library" is never a reason to omit the behaviour.
4. **Then run the live reference (§C.6)** — the rendered page reveals what static reading misses: what actually moves, on which trigger, how long it takes.
5. Only after 1-4: write the manifest and start building. Reading the markup and starting to build is the failure mode this rule exists to kill.

Multiple pages/sections in the delivery → the review is per section in build scope, but **shared CSS/JS is read once, fully**, because effects are global.

**C.1 Structure & values**
1. Tag → native Webflow element (build-reference node table); DOM = element tree. Pattern that maps to a native module (slider/tabs/dropdown/lightbox/form/nav) → that module, even if the HTML hand-rolled it with divs+JS
2. CSS values → class styles exactly, longhand (**read the FULL stylesheet, incl. `<style>` blocks, `@media`, `:root`** — never style off the HTML alone)
3. CSS custom properties → Webflow variables, same names/roles
4. `@media` → breakpoint overrides handed to responsive-pass (source-specified, not derived)
5. Real copy, real images: every text string and asset comes from the file (§ Content fidelity)

**C.2 EFFECT SWEEP (mandatory — grep the CSS/JS, list every hit)**

Scan for and enumerate each occurrence:

| Grep for | Ladder tier | Notes |
|---|---|---|
| `:hover` `:focus` `:active` `:focus-visible` | T1 | pseudo-state via style tool + transition on base class |
| `transition` `will-change` | T1 | longhand triple |
| `::before` `::after` `content:` | **T2** | → real child element (build-reference T2 recipes) |
| `clip-path` `mask` `-webkit-mask` | T2 | SVG asset preferred; clip-path only if read-back+render verified |
| `@keyframes` `animation:` `animation-name` | **T3** | one native Interactions timeline per keyframe set, every stop preserved, panel loop for `infinite` — never injected GSAP/CSS |
| `<canvas>` `getContext(` `requestAnimationFrame` `WebGL` | **T4** | canvas kept as canvas — never swapped for a static image or CSS approximation |
| `addEventListener` (scroll/mousemove/click) | T3 (T4 only if no panel equivalent) | scroll/parallax/scrub/toggle/mouse-move → native Interactions panel; only physics simulation → T4 |
| `filter` `backdrop-filter` `mix-blend-mode` | T1 | check support list below |
| `transform` | T1 translate/scale · T2 for rotate (pre-rotated SVG) | |
| `position: sticky` `IntersectionObserver` | T1 sticky · T3 reveal (panel) | |
| `svg` `<use` `currentColor` | asset flow | run build-reference § SVG pre-flight on every file |
| `cursor:` `mousemove` `pointermove` custom-cursor divs | T1 `cursor` value · T3 for a follower element (mouse-move interaction) | a bespoke cursor is a feature, not decoration — never dropped |
| `preloader` `loader` `loading` `window.onload` `DOMContentLoaded` + class toggle | T3 page-load timeline | loading/intro animation is a section of its own; log its exact sequence |
| `.reveal` `.animate` `.is-visible` `.in-view` + `IntersectionObserver`/`scrollY` | T3 scroll-into-view | the CSS holds the from/to, the JS holds the trigger + threshold — capture both |
| `animation-delay` `animation-direction` `animation-fill-mode` `animation-iteration-count` `cubic-bezier(` `steps(` | part of its T1/T3 row | exact numbers, never "roughly" (§C.5) |
| `@media (prefers-reduced-motion` | reduced-motion setting on the interaction | mirror it, don't invent one |
| `<video autoplay` `loop` `muted` `playsinline` | native Video / background-video | never an image stand-in |
| `scroll-snap` `container-type` `@layer` `color-mix()` `@property` `:has()` | ❌ unsupported | ledger + nearest native alternative, stated to user |

Support: ✅ layout/type/color/spacing/border/shadow/transform(translate,scale)/transition/filter/backdrop-filter/aspect-ratio · ⚠️ clip-path (verify read-back), `mix-blend-mode` (multiply/screen/overlay) · ❌ scroll-snap, scroll-behavior, overscroll-behavior, contain, container-type, @layer, @scope, nesting, color-mix(), light-dark(), @property, `:has()`

**C.2b Library sweep — a CDN dependency is an effect spec, not an excuse**

Grep every `<script src>` / `import` / global (`window.gsap`, `AOS`, `Swiper`…). Each library gets a native route; the *behaviour it produced* is what must ship.

| Library found | Native route | Notes |
|---|---|---|
| GSAP / ScrollTrigger / ScrollSmoother / SplitText | **T3 native Interactions panel** (same engine, in-platform) | read the tween configs literally — duration/ease/stagger/scrub become panel values. NEVER re-inject GSAP (agent Rule 12) |
| AOS, ScrollReveal, WOW.js, `data-aos="fade-up"` attrs | T3 scroll-into-view interaction | attribute values carry the animation + delay + duration — translate each |
| Swiper, Slick, Splide, Owl, Flickity | native `slider` module (+ T3 for autoplay/transition feel) | never a div carousel; slider re-init is Designer work → ledger |
| Lenis, Locomotive Scroll (smooth scroll) | ❌ no native equivalent — impossible case + note | the *reveals* it drove are still built at T3; only the smoothing is dropped, stated to user |
| Lottie-web / bodymovin | native `Lottie` element + the same `.json` | upload the JSON, never a GIF/video substitute |
| three.js, particles.js, tsParticles, p5, WebGL shaders | **T4 contained code** (canvas set) | reproduce the real config (counts, speeds, colors); registry log required |
| typed.js, Splitting.js, countUp.js, marquee libs | T3 (SplitText / stagger / loop / count-up) | panel features — never code |
| Isotope / Masonry filtering | native grid/flex + Tabs or CMS filter; JS-only sort → ledger | layout stays native |
| Bootstrap/Tailwind utility CSS | resolved values → BEM classes | utilities are values, never class names to copy |
| jQuery + hand-rolled toggles (accordion, tabs, modal, nav) | native Dropdown / Tabs / Lightbox / Navbar | the div+JS original does NOT justify a div imitation |

**C.3 Output — numbered effect manifest (goes in the spec, drives verify)**

```
effects:
  E1 hover  .btn-primary       bg #1E40AF→#1D4ED8 + translateY(-2px), 200ms ease   T1  → build now
  E2 pseudo .card::after       120px radial glow, blur 40, opacity .6, top -20 left -20  T2  → child .card__glow
  E3 keyfr  float 6s infinite  translateY 0→-12→0, ease-in-out, alternate           T3  → Interactions build-script (ledger)
  E4 canvas #particles         180 dots, 0.4px/frame drift, links <120px, #2DD4BF   T4  → contained embed (authorized)
  E5 shape  .badge             pentagon clip-path polygon(...)                        T2  → SVG asset
  E6 reveal .feature ×4        opacity 0→1 + y 40→0, 600ms ease-out, IO threshold .2, 120ms stagger  T3  → Interactions build-script
  E7 load   #preloader         logo fade+scale 1.1→1 900ms, then wipe up 600ms cubic-bezier(.7,0,.2,1)  T3  → page-load timeline
  E8 cursor .cursor-dot        follows pointer, lerp .15, scales ×2 over links        T3  → mouse-move interaction
```

Every row ends the build as `built` / `interactions-queued` / `code-tier` / `impossible+alternative` — pixel-verify fails on any row without a status (agent Rule 12). Never merge two effects into one row; never leave an effect off the list because it looks minor.

**C.4 Canvas capture detail** (needed to rebuild faithfully, not approximate): particle/element count, size range, speed + direction, spawn/respawn rule, colors + opacity, link/line rules + distance threshold, blend mode, background, interaction (mouse repel/attract, click spawn), fps target, DPR handling, resize behavior. Missing detail → read the JS, don't invent.

**C.5 Timing is a value, not a vibe** — every animated row carries exact numbers copied from the source, never a house default:

`duration` · `delay` (incl. per-item stagger increments) · `timing-function` (the literal `cubic-bezier()`/`steps()`/keyword) · `iteration-count` · `direction` · `fill-mode` · `transition-property` list (which properties actually animate) · trigger threshold (IntersectionObserver `threshold`/`rootMargin`, scroll offsets) · scrub range + smoothing.

Shorthand `transition: all .3s ease .1s` → decompose to property/duration/easing/delay before it enters the manifest. `all` is never carried over — list the properties that visibly change. Quality defaults (motion-build § Quality defaults) apply ONLY where the source is genuinely silent, and every such value is tagged `derived` in the manifest.

**C.6 RUN THE REFERENCE — static reading is half the intake (mandatory when the delivery includes CSS/JS)**

Open the file in the same headless Chrome used for verification and capture what it actually does. `file://` works everywhere a URL does:

```
REF=file:///abs/path/to/reference/index.html
node docs/memory/webflow/ref-extract.js  "$REF" ref-cache/html/{section}-1440.json 1440 "{sectionSel}" 0 9251   # computed CSS = exact values
node docs/memory/webflow/state-shot.js   "$REF" ref-cache/html/{section} 1440 "{sectionSel}" "base,auto,scroll:40" 0 9271  # resting + hover + scroll states
node docs/memory/webflow/motion-verify.js "$REF" ref-cache/html/{section}-motion.json 1440 "{sectionSel}" all 0 9261       # what moves, on what trigger, for how long
```

Products (all cached under `ref-cache/html/{section}/`, fetch-once like any other source):
- **State shots** `-base/-hover-*/-scroll-*.png` → the side-by-side targets pixel-verify §1.8 scores the build against. A hover the reference shows and the build doesn't is now measurable, not a matter of opinion.
- **Reference motion fingerprint** (`-motion.json`) → per element: `moved`, `propsAnimated`, `durationDeclaredMs`, declared strings. This is the timing source of truth for §C.5 and the parity baseline for the built page.
- **Computed CSS** → resolves variables, inheritance and cascade; use it over hand-read CSS whenever the two disagree.

Read the state shots and the fingerprint BEFORE writing the manifest — they routinely surface effects no grep found (JS-injected classes, library defaults, `:hover` on a parent driving a child). Reference is unrunnable (missing assets, needs a server) → say so, fall back to static reading, and mark the manifest `reference-not-run` so verification knows the baseline is weaker.

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

## Output — working spec (per section, in-context note, not saved doc)

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
