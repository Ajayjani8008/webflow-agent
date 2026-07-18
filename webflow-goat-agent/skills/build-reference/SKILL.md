---
name: build-reference
description: Lookup tables for Webflow builds — node types, Figma→Webflow element and property mapping, longhand rule, standard variable set, color/spacing matching rules, CMS/Symbol heuristics, REST API fallback, error codes, cross-site portability traps, and impossible cases documentation.
---

# Build Reference

## Node types — NATIVE MODULE FIRST (the ONLY building blocks)

**Gate: before building any pattern, find its row here. A native module exists → USE IT — building a div-imitation of it = ban-sweep FAIL (agent Rule 4).** Div-blocks are for layout boxes, not for re-implementing modules Webflow ships.

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

## data_style_tool limitations (verified 2026-07-11)

- **Rejects `-webkit-*` prefixed properties.** For gradient text, FIRST try the unprefixed longhands on a nested `span` inside the heading: `background-image: <gradient>` + `background-clip: text` + `color: transparent` (worked in the Encircle build — see memory [[webflow-pixel-match-method]]). Tool rejects those too → solid fallback color (mid-gradient hue) + ledger entry — Designer has native text-gradient picker (Text color → gradient). Never inject style.
- **SVG-as-`Image` can't be recolored via CSS** (`color`/`fill` don't reach it). Need specific color → upload correctly-colored SVG or rebuild glyph natively; else Designer-polish ledger entry.

## SVG & image assets (verified 2026-07-13)

No dedicated SVG element — `Image` IS the SVG module (crisp/scalable). Inline `<svg>` = embed = BANNED.
**The one flow:** ① `asset_tool upload_image_by_url` (accepts `.svg`, incl. `figma.com/api/mcp/asset/...`) → `{id, url}` ② `data_element_builder` Image → `set_image_asset {image_asset_id, alt_text}`. Bind by **asset id**, never raw URL.
**Never:** `set_attributes name="src"`/raw CDN URL (→ "does not exist in asset library") · rasterize SVG→PNG for normal icon/logo (only a complex multi-vector graphic that fails as one SVG — note fidelity compromise) · `compress_assets` on SVG (→ 400 "never-compressible").

## Element builder text gotcha (verified 2026-07-11)

Inline `set_text` honored ONLY on `Heading`, `Paragraph`, `Button`, `TextLink`, `LinkBlock`. `TextBlock` → created as plain `Block` + placeholder String child, `set_text` silently ignored → renders "This is some text inside of a div block." Fixes: (a) prefer Paragraph/Heading; (b) read subtree, `set_text` on the **String child node id** (Block parent → "element doesn't support text"); (c) text leaf needing a margin-free div: `type: "DOM"` + `set_dom_config {dom_tag:"div"}` — DOM divs take `set_text` reliably, no default `<p>` margin (verified, see [[webflow-pixel-match-method]]). Batch all String set_text in one call.

## Native form gotchas (verified 2026-07-12)

- **`Form` auto-generates full skeleton** (`FormWrapper > FormForm > [labels, inputs, submit]` + `FormSuccessMessage`/`FormErrorMessage` siblings). Can't pass `children` at creation (lone `FormTextInput` errors + rolls back). Build bare Form → read subtree → edit generated children.
- **Single-field form:** keep FormForm + first input, restyle, remove extra labels/inputs/button. **KEEP Success/Error messages** (display:none until submit) — removing them in the same batch that empties the form can prune the ENTIRE FormWrapper. Must remove → separate later call + re-verify.
- **`FormTextInput` placeholder UNSETTABLE via MCP** (attribute → "internal error"; settings channel → "reserved"; no settings key). Native workaround: absolute `Paragraph` overlay (pointer-events:none, nowrap/ellipsis) over transparent borderless real input (bg transparent, border-*-width 0, box-shadow none, height auto). Input stays focusable underneath. `name`/`domId`/`required`/`type` DO set via `set_settings`. Log placeholder limit to impossible_cases.md.

## Standard variable set (create at project start if absent)

Colors: `--color-primary` `-primary-dark` `-secondary` `-text` `-text-muted` `-surface` `-surface-alt` `-surface-dark` `-border` `-error` `-success` `-warning` (values from design, not defaults).
Spacing: `--space-xs 4` `sm 8` `md 16` `lg 24` `xl 32` `2xl 48` `3xl 64` `4xl 96` `5xl 128` `6xl 192`.
Font size: `--font-size-xs 12` `sm 14` `md 16` `lg 18` `xl 20` `2xl 24` `3xl 30` `4xl 36` `5xl 48` `6xl 60` `7xl 72`.
Radius: `--radius-sm 4` `md 8` `lg 16` `full 9999`. Motion: `--duration-fast 150ms` `base 250ms` `slow 400ms` · `--easing-standard cubic-bezier(0.4,0,0.2,1)`.

**Matching:** color ±15/channel of existing var → reuse; else NEW var with exact hex. Spacing/type ±10% of scale step → step; else NEW var exact px (`--space-hero-120`). Never round >10% onto the scale.

## CMS / Symbol heuristics

CMS: ≥3 same-structure + editor-updated + per-item image/detail page → Collection List, `xattr` bindings `{"name":"textContent"|"src","binding":"field-slug"}`. Symbol: ≥2 instances, same structure, non-editorial. Once: static div-block.

## Interactions (native only)

Hover → class `:hover` + transition (portable, copies with DOM). Scroll/click/load → native IX2, Limit: once.

**HOVER STATES ARE PART OF THE BUILD.** Figma statics don't encode hover → check source (interactive-component variant / prototype via `get_motion_context`) → none → standard derived pattern + tell user it's derived.
**Mechanics:** transition on BASE class (eases in AND out) → hover via `update_style` `pseudo: "hover"`. Transition LONGHAND (`transition-property`/`-duration`/`-timing-function`). Typical 150-250ms, `ease`/`cubic-bezier(.2,.6,.2,1)`.
**Derived patterns:** Button → `translateY(-2px)` + stronger shadow (or `brightness(1.08)`) · Card → `translateY(-4px)` + brighter border + deeper shadow · Text link → color shift and/or arrow `translateX(3px)` · Icon/nav → opacity 0.7→1 or color shift.
Same element type = same timing site-wide (registry `## Interactions`). Touch ignores hover — never hide essential content behind it.

### Animation intake — from DESCRIPTION or REFERENCE SITE (never Figma)

Never copy reference JS/CSS — rebuild intent natively.
**Sources:** user description → parse to `trigger + target + property + timing` (e.g. "cards fade up staggered on scroll" → scroll-into-view, opacity 0→1 + translateY 24→0, 100ms stagger, once); ask ONLY if a choice changes the build. Reference URL → WebFetch page/CSS + screenshot states → identify what/trigger/timing → replicate intent (state: approximation, not pixel copy).
**Routing:** hover/focus/active/state → class + transition via style tool → **buildable now**. Scroll-reveal/scroll-progress/page-load/click-toggle/mouse-parallax → **IX2 = Designer-only via MCP** → exact spec to pending_designer_work.md: trigger, target, from→to, duration, easing, delay, stagger, Limit: once, reduced-motion note. Never fake IX2 with embeds.
**Quality defaults:** animate ONLY transform/opacity/filter, max 3 props (never width/height/top/left/margin/padding/font-size — jank). Durations: UI 150-300ms, entrances 400-700, hero 600-900. Easing: entrances `ease-out`/`cubic-bezier(.2,.6,.2,1)`, loops `ease-in-out`. Stagger: 2-3 items 100ms · 4-6 80 · 7-12 60 · >12 40; max 150. Scroll reveals Limit: once. Respect `prefers-reduced-motion`. Intensity per user (subtle ↔ high), state which applied.
**Report split every time:** applied NOW (hover/state) vs queued IX2 specs — nothing silently missing. Effect neither can do → out of native scope + nearest alternative; no code.

## Impossible cases

Single source of truth: `docs/memory/impossible_cases.md`. Log new cases there with native alternative. Never force.

## API mode fallback (no MCP)

```
GET    /v2/sites/{site_id}/pages
GET    /v2/pages/{page_id}/dom
POST   /v2/pages/{page_id}/dom          ⚠ REPLACES content: always GET → merge → POST
POST   /v2/sites/{site_id}/variables
POST   /v2/sites/{site_id}/pages/{page_id}/elements
PATCH  /v2/sites/{site_id}/pages/{page_id}/elements/{id}
DELETE /v2/sites/{site_id}/pages/{page_id}/elements/{id}
```
(`custom_code` endpoints exist — never call.) Auth `Bearer $WEBFLOW_API_KEY`, 60/min. Class styles CANNOT be set via REST → exact Designer steps + ledger; never claim styles applied.

**POST /dom merge safety:** GET current → build desired → merge (keep existing elements not yours) → POST merged → GET again, confirm old + new present. Never POST only your elements.

| Code | Cause → fix |
|---|---|
| 401 | bad token → regenerate |
| 403 | missing scope |
| 404 | wrong page/site id → re-fetch list |
| 422 | invalid node type/fields → check node table |
| 429 | rate limit → backoff 10s/30s/60s |

## Portability traps (cross-site copy)

Copies with DOM: structure, text, static image URLs, class styles incl. `:hover` transitions. Does NOT copy: IX2 (project DB) · slider/tabs/navbar init (`w-*` Designer-assigned) → dead shells until re-init → status `partial` + ledger · CMS bindings (ids differ) · Symbols (site-specific ids). Multi-site build → prefer `:hover` over IX2, document IX2 specs in registry for recreate. Custom-code "portable" workarounds banned.

## Error recovery

| Error | Recovery |
|---|---|
| Tool fails mid-section | build_state.json → last successful element → retry from there |
| 429 repeatedly | pause 60s, retry; still failing → Designer manual mode for section |
| 422 on element | check node table — wrong parent type / missing fields |
| Style update fails | class exists? property name valid Webflow CSS? |
| Figma MCP unreachable | REST + `FIGMA_TOKEN`; no token → ask screenshot source |
| Bridge disconnected | reconnect; persistent → API build + Designer steps for styles |
| Build state corrupted | rebuild from Designer: `get_current_page` + snapshot |
