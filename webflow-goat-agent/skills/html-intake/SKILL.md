---
name: html-intake
description: Intake from an HTML/CSS/JS delivery used as the build source (files on disk or pasted markup). Read the WHOLE delivery, sweep every effect and library, capture exact timings, then RUN the reference headless for state shots + a motion fingerprint. Load ONLY for HTML sources — never on Figma (design-intake), screenshot (design-intake §B) or live-URL (url-intake) builds.
---

# HTML Intake — the delivery is a behaviour contract

Split out of design-intake in v1.8.0 (source isolation: a Figma build must not pay for these tables, and vice versa). Everything else in the pipeline is unchanged — this produces the same spec format as design-intake § Output, and pixel-verify / responsive-pass don't care where the spec came from.

**Still applies from `design-intake`, don't duplicate it here:** § R render-first study · § D assets · § E validation checkpoint · § CF content fidelity · § Output spec format. Load design-intake for those sections only if the build needs them spelled out; the rules below assume them.

Section labels are kept as `C.x` so every existing cross-reference (agent rule HTML/URL REFERENCE, pixel-verify § behaviour parity, motion-build, url-intake) still resolves.

## C. HTML/CSS reference — recreate it ALL, nothing simplified

The HTML file is the contract — **behaviour included, not just layout.** Every interactive and visual effect in it must exist in the Webflow build at its ladder tier (build-reference § Effect Fidelity Ladder), never dropped, never "approximated". Layout-only recreation is the #1 failure of HTML→Webflow work and is a FAIL, not a partial.

**The source's code is a SPEC, never the build plan.** Its markup is div soup to be re-mapped onto native modules; its CSS is values to land on classes; its JS is behaviour to re-express at T1/T2/T3. Build order per row is always native-module map → T1 class styles → T2 real child → T3 native Interactions panel → and only for a proved canvas/WebGL case, **ask the user** and build T4 on an explicit yes (build-reference § Ladder T4). "The reference did it in JS/CSS" is the reason to *route* it natively, never a licence to copy the code.

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
| `svg` `<use` `currentColor` | asset flow | run webflow-platform § SVG pre-flight on each one |
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
| GSAP / ScrollTrigger / ScrollSmoother / SplitText | **T3 native Interactions panel** (same engine, in-platform) | read the tween configs literally — duration/ease/stagger/scrub become panel values. NEVER re-inject GSAP (agent rule NOTHING SILENTLY OMITTED) |
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

Every row ends the build as `built` / `interactions-queued` / `code-tier` / `impossible+alternative` — pixel-verify fails on any row without a status (agent rule NOTHING SILENTLY OMITTED). A `code-tier` row is only legal once it carries **`T1/T2/T3 why-not` proof + the user's verbatim yes + date**; until then it stays `awaiting-permission`, and if the user doesn't authorize it the row ships as `native-fallback: [what shipped]` (never `simplified`). Never merge two effects into one row; never leave an effect off the list because it looks minor.

**C.4 Canvas capture detail** (needed to rebuild faithfully, not approximate): particle/element count, size range, speed + direction, spawn/respawn rule, colors + opacity, link/line rules + distance threshold, blend mode, background, interaction (mouse repel/attract, click spawn), fps target, DPR handling, resize behavior. Missing detail → read the JS, don't invent.

**C.5 Timing is a value, not a vibe** — every animated row carries exact numbers copied from the source, never a house default:

`duration` · `delay` (incl. per-item stagger increments) · `timing-function` (the literal `cubic-bezier()`/`steps()`/keyword) · `iteration-count` · `direction` · `fill-mode` · `transition-property` list (which properties actually animate) · trigger threshold (IntersectionObserver `threshold`/`rootMargin`, scroll offsets) · scrub range + smoothing.

Shorthand `transition: all .3s ease .1s` → decompose to property/duration/easing/delay before it enters the manifest. `all` is never carried over — list the properties that visibly change. Quality defaults (motion-build § Quality defaults) apply ONLY where the source is genuinely silent, and every such value is tagged `derived` in the manifest.

**C.6 RUN THE REFERENCE — static reading is half the intake (mandatory when the delivery includes CSS/JS)**

Open the file in the same headless Chrome used for verification and capture what it actually does. `file://` works everywhere a URL does:

```
REF=file:///abs/path/to/reference/index.html
node "$WF/scripts/ref-extract.js"  "$REF" ref-cache/html/{section}-1440.json 1440 "{sectionSel}" 0 9251   # computed CSS = exact values
node "$WF/scripts/state-shot.js"   "$REF" ref-cache/html/{section} 1440 "{sectionSel}" "base,auto,scroll:40" 0 9271  # resting + hover + scroll states
node "$WF/scripts/motion-verify.js" "$REF" ref-cache/html/{section}-motion.json 1440 "{sectionSel}" all 0 9261       # what moves, on what trigger, for how long
```

Products (all cached under `ref-cache/html/{section}/`, fetch-once like any other source):
- **State shots** `-base/-hover-*/-scroll-*.png` → the side-by-side targets pixel-verify §1.8 scores the build against. A hover the reference shows and the build doesn't is now measurable, not a matter of opinion.
- **Reference motion fingerprint** (`-motion.json`) → per element: `moved`, `propsAnimated`, `durationDeclaredMs`, declared strings. This is the timing source of truth for §C.5 and the parity baseline for the built page.
- **Computed CSS** → resolves variables, inheritance and cascade; use it over hand-read CSS whenever the two disagree.

Read the state shots and the fingerprint BEFORE writing the manifest — they routinely surface effects no grep found (JS-injected classes, library defaults, `:hover` on a parent driving a child).

**Unrunnable is a proven state, not a shrug (v1.9.0).** `file://` failing is usually fixable in one command: serve the folder — `python3 -m http.server 8765 --directory <ref-folder>` → re-run the three commands against `http://localhost:8765/<file>.html` (resolves module scripts, CORS-blocked fetches, absolute `/asset` paths). Only when the served retry also fails may the manifest carry `reference-not-run`, and it must carry **the exact command + the exact error output** with it (pixel-verify §1.8). A bare "wouldn't run" is treated as a skipped gate.
