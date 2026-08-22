---
name: build-reference
description: WHAT to build — native module table (module-first gate), Effect Fidelity Ladder T1-T4 with recipes, Figma→Webflow element + CSS property mapping, longhand rule, standard variable set + dedup rules, CMS/component heuristics, hover mechanics, impossible-case logging. Platform limits, MCP tool surface, REST fallback and error recovery live in `webflow-platform` — load that only when needed.
---

# Build Reference

**Scope:** what to build and how to express it natively. Platform surface, tool quirks, SVG/forms gotchas, REST fallback, error codes and portability traps moved to `webflow-platform` (v1.8.0) — load it on the first build of a session, on any tool error, or when SVG/forms/components/CMS/REST enter scope.

**No-toy default (agent Rule 17).** When the brief is thin ("build a pricing section", "add a hero"), build what a senior studio ships, not the minimum that matches the words: real hierarchy and type scale, deliberate spacing rhythm, depth where the design language implies it (T2 layered children, gradients, shadows, borders), every interactive element with a full state set (`:hover`/`:focus`/active, and disabled where it exists), real content, responsive at every breakpoint. Fill gaps by assumption stated in one line, then build — never by asking the user to specify what you can infer, never by a stub. Depth of the thing asked for, never extra scope. Motion side: `motion-build` § Under-specified brief.

## Node types — NATIVE MODULE FIRST (the ONLY building blocks)

**Gate: before building any pattern, find its row here. A native module exists → USE IT — building a div-imitation of it = ban-sweep FAIL (agent rule NATIVE MODULE FIRST).** Div-blocks are for layout boxes, not for re-implementing modules Webflow ships.

| Design element / pattern | WF native module | Notes |
|---|---|---|
| Section wrapper | `section` | |
| Max-width wrapper | `container` | |
| Layout box (no native module fits) | `div-block` | last resort, layout only |
| H1–H6 | `heading` + `data.tag: "h1"…"h6"` | |
| Body text | `paragraph` | |
| Small text / label | `text-span` | |
| Bullet / numbered list | `list` → `list-item` | never stacked paragraphs with fake bullets |
| Quote / testimonial text | `blockquote` | |
| Image (incl. SVG) | `Image` | native SVG-capable — bind uploaded asset id via `set_image_asset`, real alt. No separate "SVG" element |
| Text link | `text-link` | |
| Block link / button | `link-block` (+ btn classes) / `button` | |
| Navbar / any site nav | `navbar` | native mobile menu built in — never div+IX2 nav |
| Rich text / article body | `richtext` | |
| Form (search, newsletter, contact) | `form-block` → `form-form` → native inputs (text/textarea/select/checkbox/radio/file) | never html-embed, never fake div inputs |
| Grid layout | `grid` | grid-template overrides per breakpoint |
| Self-hosted / background video | `video` / background-video | never iframe embed |
| YouTube / Vimeo | native `YouTube` / `Video` module | never iframe embed |
| Vector/JSON animation | native `Lottie` element | never GIF fallback without asking |
| Slider / carousel | `slider` → `slide` children | never div+IX2 carousel |
| Tabs / segmented content | `tabs` → `tabs-menu` + `tabs-content` | |
| Accordion / FAQ / dropdown menu | native `dropdown` (+ IX2 open/close in Designer) | never `<details>`, never height animation |
| Image gallery / click-to-zoom | native `lightbox` | never custom modal div |
| Search | native `search` (site search) or single-field `form-block` | |
| Map | native `map` element | never iframe embed |
| Symbol instance | `component` + `componentId` | |
| CMS list | `collection-list-wrapper` → `collection-list` → `collection-item` | bind via `xattr` |
| Divider | `divider` | horizontal only |
| Embed (BANNED) | `html-embed` | NEVER USE |

MCP builder can't create a listed module (missing type/422)? → build it in ledger as Designer step — still NEVER div-imitate it.

## EFFECT FIDELITY LADDER — every visual effect gets a tier, none gets dropped

Source has an effect (hover, pseudo-element, keyframe, canvas, shape, filter, transition) → find its row, build at the LOWEST tier that reproduces it exactly. **Descent is strictly ordered and each step must be attempted before the next is considered: T1 → T2 → T3 → (ask permission) → T4.** Starting at a lower tier because the source used code, because it looks faster, or because the reference's markup was already written that way = ban violation. "Webflow has no control for it" is never a reason to simplify or omit — it is a reason to move ONE tier down, with the reason written out. Every effect from the source lands in the intake `effects:` manifest with its tier, and pixel-verify FAILS on any manifest row with no tier/status (agent rule NOTHING SILENTLY OMITTED).

| Tier | Path | Covers |
|---|---|---|
| **T1 native control** | `data_style_tool` on class (incl. `pseudo: "hover"/"focus"/"active"`) | color/bg/gradient, spacing, radius, border, box-shadow, opacity, `filter`, `backdrop-filter`, `transform: translate/scale`, `transition-*`, `mix-blend-mode`, `overflow`, `object-fit`, `aspect-ratio`, `position`+offsets, `z-index` |
| **T2 native structure** | real child element + class (visually identical, Designer-editable) | `::before`/`::after`, custom shapes, decorative overlays/glows, gradient borders, badge dots, underline swipes, masks |
| **T3 native motion** | **Native Interactions panel — GSAP-powered, no code** (timeline, ScrollTrigger, SplitText, staggers). Designer-only: verified NO API surface (`designer_tool` has zero interaction actions; Webflow's tool registry returns "full tool list" for INTERACTIONS) → `[critical]` ledger build-script · OR native `Lottie` element. Route via `motion-build`. **Never inject GSAP/tween code — the engine is already in the platform** | `@keyframes`/`animation`, scroll-reveal, scroll-scrub/parallax, pinning, page-load, click-toggle, marquee, infinite loops, staggered groups, split-text, SVG morph, vector motion |
| **T4 contained code** | last resort — eligible set below AND a per-effect user yes (descent proof first; no yes → native fallback) | `<canvas>` + JS animation, WebGL, physics/particle simulation, `clip-path` when T1 read-back fails AND no SVG path works. **NOT** scroll-scrub, split-text, mouse-move, staggers or timelines — those are native Interactions-panel features (T3) |

### T2 recipes (the pseudo-element + shape answers)

Webflow has NO `::before`/`::after` control and no clip-path control in the Style panel. The native equivalent is a REAL element — same pixels, editable, portable, passes the ban sweep.

| Source CSS | Native build |
|---|---|
| `::before`/`::after` decorative box | child `div-block` class `block__deco` · parent `position: relative` · child `position: absolute` + the pseudo's own offsets/size/bg/radius/transform · `pointer-events: none` when non-interactive |
| `::before` icon/glyph | child `Image` (uploaded SVG) or `text-span`, absolute-positioned — never a font-icon embed |
| `::after` underline / hover swipe | child div (h 2px, `width: 0`, `left: 0`, `bottom: 0`) + parent `:hover` child `width: 100%` + transition on child base class |
| `content: counter()` / list markers | native `list`/`list-item` |
| Gradient border | wrapper div w/ gradient `background-image` + padding = border width; inner div solid bg + inner radius |
| Glow / soft aura | absolute child, `filter: blur(Npx)`, gradient bg, `z-index: -1` (or behind sibling via order) |
| **Polygon / hexagon / pentagon / arrow / blob / diagonal cut** | ① **preferred:** export the shape as SVG → `asset_tool` upload → native `Image` (exact, cross-browser, scales) — or as `background-image` on the class ② `clip-path: polygon(...)` via `data_style_tool` — allowed ONLY after read-back proves it applied AND a rendered shot proves it renders; unverified → back to ① ③ still impossible → T4 + log |
| Rotated shape (Figma `rotation`) | pre-rotated SVG asset — class rotate is not available (see § Transform) |

### T3 recipes (@keyframes → native Interactions panel)

Read the `@keyframes` block → one panel timeline, each stop a tween on the SAME properties (transform/opacity/filter/colour). Infinite → the panel's loop setting. Per-letter/word motion → SplitText control, not hand-split spans. Scroll-linked → ScrollTrigger with start/end/scrub. Build-script must carry: trigger · target class or component · every stop (offset % → values) · duration · easing · delay · iteration · direction · stagger · reduced-motion. Mark `[critical]` — an unbuilt animation is a missing feature, never "optional polish".

No panel equivalent at all (WebGL, physics simulation, canvas particle systems) → T4, stated as such. Path morph, split-text and scroll-scrub ARE panel features — never route them to code.

### Ladder T4 — contained code (canvas & JS-driven only)

**Eligibility ≠ authorization.** The canvas/WebGL set below is the ONLY code-eligible category — but eligibility just earns the right to *ask*. Before writing a single line:

1. **Write the descent proof** for that specific effect: `T1: [tried what / why it can't] · T2: [recipe checked / why not] · T3: [panel feature checked, get_more_tools asked / why not]`. No proof = no code, full stop.
2. **Ask the user and wait for an explicit yes** — one line per effect, all of a section's asks batched into ONE message:
   *"E4 `#particles` canvas (180 dots, link <120px): T1/T2/T3 can't reproduce it because [reason]. Native fallback: [static gradient / Lottie loop / nearest native motion]. Add a contained canvas embed, or ship the native fallback?"*
   No answer, "up to you", or "do what's best" → **build the native fallback**, note it, move on. Never read silence as consent.
3. **Log the authorization verbatim:** registry `## Custom-Code-Exceptions` gets the user's actual words + date alongside the snippet entry. pixel-verify's ban sweep FAILS a T4 hit whose registry entry has no recorded permission (§1 whitelist), even when the effect is in the manifest.
4. Permission is per effect, per session — never a mode, never inherited by the next canvas, the next section, or a later session.

Anything OUTSIDE this set: the USER invokes `/custom-code-once` themselves. The agent never proposes it, never hints that code would be easier, and never self-invokes.

Containment rules (all mandatory):
1. **Scope:** ONE `html-embed` holding only the effect (e.g. `<canvas>` + its `<script>` in an IIFE), or page-footer code. Never layout, spacing, typography, color, hover, or anything a T1–T3 row covers — that is still an instant ban-sweep FAIL.
2. **Sizing/layout stays native:** the embed's wrapper div is a normal styled class (width/height/position via style tool). Canvas gets `width:100%; height:100%; display:block` + DPR-aware resize (`devicePixelRatio`, `ResizeObserver`) so it is not fixed-px and not blurry on retina.
3. **Self-contained:** no CDN/`<script src>`, no libraries, no globals (IIFE), guard `if (!el) return`, `cancelAnimationFrame` on unmount/hidden (`document.hidden`), honor `prefers-reduced-motion` (static first frame).
4. **Log both, same pass:** `registry.md ## Custom-Code-Exceptions` (`[date] page/section — canvas: what, descent proof (why T1-T3 impossible), user authorization: "<their exact yes>"`) + `pending_designer_work.md` `[optional]` review entry.
5. **Report it:** the section report names every T4 effect. Silent code = ban violation even when authorized.
6. **Fidelity:** reproduce the source animation's actual math (particle count, speed, colors, easing, blend) — a "similar" canvas is a simplification and fails the CONVERGE / NOTHING-OMITTED rules.

## Figma → Webflow element

| Figma | Condition | Webflow |
|---|---|---|
| FRAME | root section | `section` |
| FRAME | layoutMode H / V | `div-block` flex row / col |
| FRAME | name slider/carousel · tab · nav · form | native `slider` · `tabs` · `navbar` · `form-block` |
| FRAME/RECTANGLE | fill=IMAGE | `image` |
| FRAME | repeated ≥2 same structure | Symbol candidate |
| FRAME | repeated ≥3, editorial | CMS Collection List |
| GROUP | any | `div-block` |
| TEXT | ≥48px→H1 · 36-47→H2 · 28-35→H3 · 22-27→H4 · 16-21→paragraph · ≤15→text-span | |
| INSTANCE | in registry Components | reuse Symbol |
| VECTOR/ELLIPSE | icon/decor | upload SVG asset → `Image` (keep vector, never rasterize) |

## Longhand rule (verified 2026-07-11/16 — how EVERY property is applied)

Every row below = Style-panel property via `data_style_tool` on a class, correct breakpoint. NEVER in Custom Properties/Attributes panel (`xattr` = zero CSS, dead junk like `margin: 0px`). `xattr` = semantics only: `id`, `href`, `alt`, `type`, `placeholder`, `role`, `aria-*`, CMS bindings `{name, binding}`.

**Shorthands land in the Custom Properties panel** (Designer UI has only expanded controls — shorthand has no home). Always expand:
`margin`/`padding` → 4 sides · `border` → `border-width`+`border-style`+`border-color` (per side if uneven) · `background` → `background-color`+`background-image` · **`gap` → `grid-column-gap`+`grid-row-gap` (native flex/grid gap control, even for flexbox)** · **`border-radius` → all 4 corner longhands, even when uniform** · `inset` → top/right/bottom/left · `flex`/`font`/`transition` → constituent longhands. Reset default margin = specific side `0px`, never `margin: 0px`. Reusing existing classes → check + rewrite their shorthands too. Pixel-verify ban-sweep confirms zero shorthands landed (gap/border-radius = most-missed).

## Figma → Webflow CSS property mapping

### Layout

| Figma | Webflow CSS | Notes |
|---|---|---|
| `layoutMode: HORIZONTAL` / `VERTICAL` | `display: flex; flex-direction: row` / `column` | |
| `layoutWrap: WRAP` | `flex-wrap: wrap` | |
| `itemSpacing` | `grid-column-gap`/`grid-row-gap` | longhand pair, never `gap` |
| `padding*` | `padding-*` per side | |
| `primaryAxisAlignItems: MIN/CENTER/MAX/SPACE_BETWEEN` | `justify-content: flex-start/center/flex-end/space-between` | |
| `counterAxisAlignItems: MIN/CENTER/MAX` | `align-items: flex-start/center/flex-end` | |
| `primaryAxisSizingMode: FIXED` (container/section/card) | `width: 100%; max-width: {n}px` | **never bare width — kills responsive** |
| `primaryAxisSizingMode: FIXED` (intrinsic icon/avatar/logo/badge) | `width: {n}px` | only genuinely fixed UI |
| `primaryAxisSizingMode: FILL` / `HUG` | `width: 100%` / `fit-content` | |
| `counterAxisSizingMode: FIXED` (container) | `min-height: {n}px` | **never bare height — reflow clips** |
| `counterAxisSizingMode: FIXED` (intrinsic media) | `height: {n}px` + `object-fit` | |
| `counterAxisSizingMode: HUG` | height auto/`fit-content` | |

**FIXED→fluid is the #1 responsive rule:** a Figma fixed width (1440/1200/600) is a canvas artifact, not intent. px width on section/container/card/text = BUG; no breakpoint override can fix a rigid base.

### Typography

| Figma | Webflow CSS | Notes |
|---|---|---|
| `fontFamily` | `font-family` | validate exists in Webflow |
| `fontWeight` | `font-weight` | REGULAR→400 MEDIUM→500 SEMIBOLD→600 BOLD→700 |
| `fontSize` / `lineHeightPx` / `lineHeightPercent` / `letterSpacing` | `font-size` / `line-height` / `letter-spacing` | px (or % lh) |
| `textAlignHorizontal` | `text-align: left/center/right/justify` | |
| `textDecoration: UNDERLINE/STRIKETHROUGH` | `text-decoration: underline/line-through` | |
| `textCase: UPPER/LOWER/TITLE` | `text-transform: uppercase/lowercase/capitalize` | |
| `fills[].color` (text) | `color` | RGBA floats → hex `#{r*255:02x}{g*255:02x}{b*255:02x}` |

### Color / effects

| Figma | Webflow CSS | Notes |
|---|---|---|
| solid fill | `background-color` | |
| gradient linear/radial | `background-image: linear/radial-gradient()` | stops + angle |
| `stroke[].color` | `border-color` (+ width/style) | |
| `opacity` | `opacity` | |
| `blendMode` | `mix-blend-mode` | LIMITED: multiply/screen/overlay only, else impossible |
| DROP_SHADOW / INNER_SHADOW | `box-shadow` (+ `inset`) | x y blur spread color |
| LAYER_BLUR / BACKGROUND_BLUR | `filter: blur()` / `backdrop-filter: blur()` | |

### Radius / border

Per-corner longhands: `topLeftRadius`→`border-top-left-radius` etc. (all 4 always). `strokeWeight`→`border-width` per side. `strokeDashes`→`border-style: dashed`. `strokeAlign: INSIDE` = Webflow default.

### Transform (LIMITED)

`rotation` → **NONE, impossible** (no native class transform rotate) · `scaleX/Y` → `transform: scale()` partial · `skew` → **NONE, impossible**.

### Position (constraints)

LEFT/RIGHT/TOP/BOTTOM → `position: absolute` + that side `0` · CENTER → `left/top: 50%` + `translateX/Y(-50%)` · STRETCH → both sides `0`.

## Standard variable set (create at project start if absent)

Colors: `--color-primary` `-primary-dark` `-secondary` `-text` `-text-muted` `-surface` `-surface-alt` `-surface-dark` `-border` `-error` `-success` `-warning` (values from design, not defaults).
Spacing: `--space-xs 4` `sm 8` `md 16` `lg 24` `xl 32` `2xl 48` `3xl 64` `4xl 96` `5xl 128` `6xl 192`.
Font size: `--font-size-xs 12` `sm 14` `md 16` `lg 18` `xl 20` `2xl 24` `3xl 30` `4xl 36` `5xl 48` `6xl 60` `7xl 72`.
Radius: `--radius-sm 4` `md 8` `lg 16` `full 9999`. Motion: `--duration-fast 150ms` `base 250ms` `slow 400ms` · `--easing-standard cubic-bezier(0.4,0,0.2,1)`.

**Matching:** color ±15/channel of existing var → reuse; else NEW var with exact hex. Spacing/type ±10% of scale step → step; else NEW var exact px (`--space-hero-120`). Never round >10% onto the scale.

## CMS / Symbol heuristics

CMS: ≥3 same-structure + editor-updated + per-item image/detail page → Collection List, `xattr` bindings `{"name":"textContent"|"src","binding":"field-slug"}`. Component (ex-"Symbol"): ≥2 instances, same structure, non-editorial → **build it via `data_component_tool` + props, not by copying subtrees** (`webflow-platform` § MCP surface); differing states → variants. Once: static div-block.

## Interactions (native only)

Hover → class `:hover` + transition (portable, copies with DOM). Scroll/click/load → native Interactions panel (GSAP-powered), fires once unless the design loops.

**HOVER STATES ARE PART OF THE BUILD.** Figma statics don't encode hover → check source (interactive-component variant / prototype via `get_motion_context`) → none → standard derived pattern + tell user it's derived.
**Mechanics:** transition on BASE class (eases in AND out) → hover via `update_style` `pseudo: "hover"`. Transition LONGHAND (`transition-property`/`-duration`/`-timing-function`). Typical 150-250ms, `ease`/`cubic-bezier(.2,.6,.2,1)`.
**Derived patterns:** Button → `translateY(-2px)` + stronger shadow (or `brightness(1.08)`) · Card → `translateY(-4px)` + brighter border + deeper shadow · Text link → color shift and/or arrow `translateX(3px)` · Icon/nav → opacity 0.7→1 or color shift.
Same element type = same timing site-wide (registry `## Interactions`). Touch ignores hover — never hide essential content behind it.

**Any animation work → load `motion-build`** — it owns Motion IR, tier routing, panel build-scripts, timing/stagger defaults and `motion-verify.js` proof. Do NOT re-derive durations or stagger tables here; there is exactly one copy and it lives there.

**Exact over intent (v1.8.0 correction):** when the source *states* timing (HTML/CSS/JS, a reference site's stylesheet, a Figma prototype), the build reproduces those exact numbers — duration, delay, easing curve, iteration, threshold — verified to ±10% (pixel-verify § behaviour parity). "Rebuild the intent" applies ONLY to a source that never specified values (a spoken description), and every filled-in value is labelled `derived`. Copying the source's *code* stays banned; matching its *numbers* is required.

## Known traps — each of these shipped a visible defect before it was written down

**`.w-button` is Webflow blue until you overwrite it.** The base `Button` element carries `.w-button`, which ships
Webflow's own blue `background-color` and white `color`. A variant class that sets only padding / radius / typography
**inherits both**, so the button renders blue on a page with no blue in it. `pixel-diff` reports this as ordinary colour
drift, which reads like a tolerance problem and gets waived. **Every button variant class MUST set its own
`background-color` explicitly** — a real colour, or `transparent` for outline/ghost — **and its own `color`.** There is
no "inherit from the design" here; the base class already decided.

**Gradient text is a child element, not a property on the heading.** Webflow has no per-run text fill, so a two-tone or
gradient headline is built as: heading holds the plain part via `set_text`, then append a **`DOM` `span` child** for the
accent run. Style the span class with the unprefixed longhands — `background-image: linear-gradient(…)` ·
`background-clip: text` · `color: transparent`. That combination is verified working through `data_style_tool` (Encircle
build). **Do not send `-webkit-text-fill-color` or any other `-webkit-*` property — the style tool rejects the whole
call**, and `color: transparent` already does that job in every browser Webflow targets. Solid mid-gradient fallback +
ledger entry is the LAST resort, only after the unprefixed set has actually been attempted and rejected — never the
opening move. Per-character gradients hide in Figma's `styleOverrideTable` and read as solid white in flat JSON: Rule 1,
the render decides.

**An absolute child of a container that STACKS must be re-flowed at that breakpoint.** When a container positions its
children absolutely (floating-card cluster, offset badge, layered hero art) and that container becomes
`flex-direction: column` at tablet/mobile, the absolute children keep resolving against the old box and **pile on top of
the stacked content** — with zero horizontal overflow, so the overflow gate stays green. Give every absolute child
`position: static` at the breakpoint where its parent stacks. Distinct from an absolute element merely *bleeding* past
its parent's edge (`responsive-pass` § collapse table), which is a containment fix, not a re-flow. A reused class system
often already handles this — verify on the built page, never assume.

## Impossible cases

Single source of truth: `$WF/impossible_cases.md` (shared across sites; `WF="$HOME/docs/memory/webflow"`). Log new cases there with native alternative. Never force.
