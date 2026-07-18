---
name: build-reference
description: Lookup tables for Webflow builds — node types, Figma→Webflow element and property mapping, standard variable set, color/spacing matching rules, CMS/Symbol heuristics, REST API fallback, error codes, cross-site portability traps, and impossible cases documentation.
---

# Build Reference

## Node types (the ONLY building blocks — nothing outside this table plus text-link/div variants)

| Design element | WF node type | Notes |
|---|---|---|
| Section wrapper | `section` | |
| Max-width wrapper | `container` | |
| Layout box | `div-block` | |
| H1–H6 | `heading` + `data.tag: "h1"…"h6"` | |
| Body text | `paragraph` | |
| Small text / label | `text-span` | |
| Image (incl. SVG) | `Image` | native SVG-capable module — bind uploaded asset by id via `set_image_asset`, real alt. No separate "SVG" element exists. |
| Text link | `text-link` | |
| Block link / button | `link-block` (+ btn classes) | |
| Navbar | `navbar` | native mobile menu built in |
| Rich text | `richtext` | |
| Form | `form-block` → `form-form` → inputs | never html-embed |
| Grid | `grid` | grid-template overrides per breakpoint |
| Video | `video` | never iframe embed |
| Slider | `slider` → `slide` children | never html-embed |
| Tabs | `tabs` → `tabs-menu` + `tabs-content` | never html-embed |
| Accordion / FAQ | native `dropdown` (or div structure + IX2 open/close in Designer) | never HTML `<details>` injection, never height animation |
| Symbol instance | `component` + `componentId` | |
| CMS list | `collection-list-wrapper` → `collection-list` → `collection-item` | bind via `xattr` |
| Divider | `divider` | horizontal line only |
| Embed (BANNED) | `html-embed` | NEVER USE |

## Figma → Webflow element

| Figma | Condition | Webflow |
|---|---|---|
| FRAME | root section | `section` |
| FRAME | layoutMode HORIZONTAL / VERTICAL | `div-block` flex row / col |
| FRAME | name has slider/carousel · tab · nav · form | native `slider` · `tabs` · `navbar` · `form-block` |
| FRAME/RECTANGLE | fill=IMAGE | `image` |
| FRAME | repeated ≥2 same structure | Symbol candidate |
| FRAME | repeated ≥3, editorial content | CMS Collection List |
| GROUP | any | `div-block` |
| TEXT | ≥48px → H1 · 36–47 → H2 · 28–35 → H3 · 22–27 → H4 · 16–21 → paragraph · ≤15 → text-span | |
| INSTANCE | in registry Components | reuse Symbol |
| VECTOR/ELLIPSE | icon/decor | upload SVG as asset → `Image` (keep vector, do NOT rasterize) |

## Figma → Webflow CSS property mapping

**HOW to apply — every row below is a Style-panel property.** Set it via `data_style_tool` on a class, at the correct breakpoint. NEVER enter any of these in the element's Custom Properties / Custom Attributes panel (`xattr`) — that panel writes HTML attributes, applies zero CSS, and leaves dead junk like `margin: 0px` on the element. `xattr` is reserved for true semantics: `id`, `href`, `alt`, `type`, `placeholder`, `role`, `aria-*`, and CMS bindings (`{name, binding}`). Rule of thumb: if the property has a control in the Webflow Style panel, it is style-tool-only. Never set a zero/default value as a custom property to "reset" — omit it.

### Layout Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `layoutMode: HORIZONTAL` | `display: flex; flex-direction: row` | |
| `layoutMode: VERTICAL` | `display: flex; flex-direction: column` | |
| `layoutWrap: WRAP` | `flex-wrap: wrap` | |
| `itemSpacing` | `gap` | Direct map |
| `paddingLeft/Right/Top/Bottom` | `padding-left/right/top/bottom` | Direct map |
| `primaryAxisAlignItems: MIN` | `justify-content: flex-start` | |
| `primaryAxisAlignItems: CENTER` | `justify-content: center` | |
| `primaryAxisAlignItems: MAX` | `justify-content: flex-end` | |
| `primaryAxisAlignItems: SPACE_BETWEEN` | `justify-content: space-between` | |
| `counterAxisAlignItems: MIN` | `align-items: flex-start` | |
| `counterAxisAlignItems: CENTER` | `align-items: center` | |
| `counterAxisAlignItems: MAX` | `align-items: flex-end` | |
| `primaryAxisSizingMode: FIXED` (container/section/card) | `width: 100%; max-width: {value}px` | **Never bare `width:{value}px`** — kills responsive. Fluid + cap. |
| `primaryAxisSizingMode: FIXED` (intrinsic: icon/avatar/logo/badge) | `width: {value}px` | Only genuinely fixed-size UI gets a hard px width |
| `primaryAxisSizingMode: FILL` | `width: 100%` | |
| `primaryAxisSizingMode: HUG` | `width: fit-content` | |
| `counterAxisSizingMode: FIXED` (container/section/card) | `min-height: {value}px` | **Never bare `height:{value}px`** — content reflow at narrow widths overflows/clips a fixed height. Use `min-height` so it grows. |
| `counterAxisSizingMode: FIXED` (intrinsic: icon/avatar, fixed media) | `height: {value}px` + `object-fit` | |
| `counterAxisSizingMode: HUG` | `height: fit-content` (auto) | |

### Typography Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `fontFamily` | `font-family` | Must validate exists in Webflow |
| `fontWeight` | `font-weight` | Map: REGULAR→400, MEDIUM→500, SEMIBOLD→600, BOLD→700 |
| `fontSize` | `font-size` | px only |
| `lineHeightPx` | `line-height` | px value |
| `lineHeightPercent` | `line-height` | percentage value |
| `letterSpacing` | `letter-spacing` | px value |
| `textAlignHorizontal: LEFT` | `text-align: left` | |
| `textAlignHorizontal: CENTER` | `text-align: center` | |
| `textAlignHorizontal: RIGHT` | `text-align: right` | |
| `textAlignHorizontal: JUSTIFIED` | `text-align: justify` | |
| `textDecoration: UNDERLINE` | `text-decoration: underline` | |
| `textDecoration: STRIKETHROUGH` | `text-decoration: line-through` | |
| `textCase: UPPER` | `text-transform: uppercase` | |
| `textCase: LOWER` | `text-transform: lowercase` | |
| `textCase: TITLE` | `text-transform: capitalize` | |
| `fills[].color` | `color` | Convert RGBA to hex |

### Color Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `fills[].color` (solid) | `background-color` | Figma RGBA → hex: `#{r*255:02x}{g*255:02x}{b*255:02x}` |
| `fills[].color` (gradient linear) | `background-image: linear-gradient()` | stops + angle |
| `fills[].color` (gradient radial) | `background-image: radial-gradient()` | stops |
| `stroke[].color` | `border-color` | + border-width, border-style |
| `opacity` | `opacity` | 0-1 range |
| `blendMode` | `mix-blend-mode` | LIMITED: multiply, screen, overlay only |
| `effects[].type: BACKGROUND_BLUR` | `backdrop-filter: blur(Xpx)` | |

### Spacing Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `paddingLeft` | `padding-left` | |
| `paddingRight` | `padding-right` | |
| `paddingTop` | `padding-top` | |
| `paddingBottom` | `padding-bottom` | |
| `marginLeft` | `margin-left` | Avoid margins in flex; prefer gap |
| `marginRight` | `margin-right` | Avoid margins in flex; prefer gap |
| `marginTop` | `margin-top` | |
| `marginBottom` | `margin-bottom` | |

### Border & Radius Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `topLeftRadius` | `border-top-left-radius` | Per-corner supported |
| `topRightRadius` | `border-top-right-radius` | |
| `bottomLeftRadius` | `border-bottom-left-radius` | |
| `bottomRightRadius` | `border-bottom-right-radius` | |
| `strokeWeight` | `border-width` | Per-side: top/right/bottom/left |
| `strokeAlign: INSIDE` | `border` (Webflow default) | |
| `strokeDashes` | `border-style: dashed` | |

### Shadow & Effects Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `effects[].type: DROP_SHADOW` | `box-shadow` | x y blur spread color |
| `effects[].type: INNER_SHADOW` | `box-shadow: inset` | x y blur spread color inset |
| `effects[].type: LAYER_BLUR` | `filter: blur(Xpx)` | |
| `effects[].type: BACKGROUND_BLUR` | `backdrop-filter: blur(Xpx)` | |

### Transform Properties (LIMITED)

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `rotation` | **NONE** | IMPOSSIBLE — no native CSS transform in Webflow classes |
| `scaleX/Y` | `transform: scale()` | Partial — basic scale only |
| `skew` | **NONE** | IMPOSSIBLE — no native skew |

### Position Properties

| Figma Property | Webflow CSS | Notes |
|---|---|---|
| `constraints.horizontal: LEFT` | `position: absolute; left: 0` | |
| `constraints.horizontal: RIGHT` | `position: absolute; right: 0` | |
| `constraints.horizontal: CENTER` | `position: absolute; left: 50%; transform: translateX(-50%)` | |
| `constraints.horizontal: STRETCH` | `position: absolute; left: 0; right: 0` | |
| `constraints.vertical: TOP` | `position: absolute; top: 0` | |
| `constraints.vertical: BOTTOM` | `position: absolute; bottom: 0` | |
| `constraints.vertical: CENTER` | `position: absolute; top: 50%; transform: translateY(-50%)` | |
| `constraints.vertical: STRETCH` | `position: absolute; top: 0; bottom: 0` | |

## Shorthands show as "Custom properties" — use longhand (verified 2026-07-11)

Setting a CSS **shorthand** via `data_style_tool` (`margin`, `padding`, `border`, `background`, `inset`, `flex`, `font`, `transition`, `border-radius` is OK) makes the Webflow Designer list it under the element's **Custom Properties** panel — the native UI has only per-side/expanded controls, so a shorthand has nowhere to map and reads like a custom attribute. This is the recurring `margin: 0px` symptom. Always expand to longhand: `margin-top/right/bottom/left`, `padding-top/right/bottom/left`, `border-width`+`border-style`+`border-color`, `background-color`+`background-image`. Reset a default margin with the specific side set to `0px`, never `margin: 0px`. When reusing existing classes, check them too and rewrite any shorthand to longhand.

## data_style_tool limitations (verified 2026-07-11)

- **Rejects `-webkit-*` properties** (`-webkit-background-clip`, `-webkit-text-fill-color`, …) → "internal error". So **gradient-clipped text cannot be set via the API.** Native alternative: set a solid fallback color via the tool (readable, ~mid-gradient hue) AND log the gradient to `pending_designer_work.md` — Webflow's Designer has a native text-gradient color picker (Text color → gradient). Never inject `<style>`/embed to force it.
- **SVG uploaded as an `<img>` asset can't be recolored via CSS** (`color`/`fill` don't reach it). If an icon must match a specific color and the source SVG isn't already that color, either upload a correctly-colored SVG or rebuild the glyph natively; otherwise log as Designer polish. Icon-font/inline-SVG recolor is not available through these tools.

## SVG & image assets — correct native path (verified 2026-07-13)

**Webflow has NO dedicated "SVG" element.** The `Image` element IS the native SVG-capable module — it renders `.svg` assets fine (crisp/scalable). SVG → `Image` is correct, not a bug. Inline `<svg>` would need `HtmlEmbed`/`DOM` = BANNED; never reach for it.

**The one correct flow (icons, logos, illustrations, any SVG):**
1. `asset_tool` → `upload_image_by_url` with the source URL (accepts `.svg` directly, incl. Figma `figma.com/api/mcp/asset/...` URLs). Returns asset `{ id, url, mimeType }`.
2. `data_element_builder` type `Image` → `set_image_asset { image_asset_id: <id>, alt_text }`. Bind by **asset id**, never the raw URL.

**Do NOT:**
- Set the image via `set_attributes name="src"` / a raw CDN URL. Webflow skips it → `"does not exist in asset library"` (the classic failure). Must be an uploaded asset id.
- Rasterize an SVG to PNG (`get_screenshot` → upload PNG) for a normal icon/logo — that throws away vector crispness. Rasterize ONLY a complex multi-vector graphic that fails to upload/render as one SVG (e.g. a layered diagram); note it as a fidelity compromise.
- Call `compress_assets` on an SVG → 400 "never-compressible". SVG is already vector; skip it in any compression pass.

**Recolor:** SVG-as-`Image` can't be recolored via CSS `color`/`fill` (see limitation above). Need a specific color → upload an already-correctly-colored SVG, or rebuild the glyph natively.

## Element builder text gotcha (verified 2026-07-11)

`data_element_builder` honors inline `set_text` ONLY on `Heading`, `Paragraph`, `Button`, `TextLink`, `LinkBlock`. A `TextBlock` in the schema is created as a plain `Block` (div) with a default placeholder String child, and its `set_text` is silently ignored → the element renders "This is some text inside of a div block." pixel-verify catches it; don't miss it.

Fixes: (a) prefer `Paragraph`/`Heading` for text nodes when possible; or (b) after building, read the subtree, find each text element's **String child** node id, and `set_text` on the STRING node id (not the Block parent — the Block returns "element doesn't support text"). Batch all String-node `set_text` in one call.

## Native Form / input gotchas (verified 2026-07-12)

Building a search box, newsletter, or any single-field form natively:

- **`Form` auto-generates a full skeleton** — `FormWrapper > FormForm > [Name label, Name input, Email label, Email input, Submit button]` + sibling `FormSuccessMessage` + `FormErrorMessage`. You cannot pass `children` on the `FormForm` at creation (a lone `FormTextInput` errors "Text Field can only be placed in a Form", and the whole action rolls back). Build the `Form` bare, THEN read the subtree and edit the generated children.
- **To make a single-field form:** keep `FormForm` + the first `FormTextInput`, restyle that input, remove ONLY the extra label(s)/input(s)/button. **KEEP `FormSuccessMessage` + `FormErrorMessage`** — they're `display:none` until submit, so harmless. Removing the Success/Error messages in the same batch that empties the form can prune the entire `FormWrapper` (whole form vanishes). If you must remove them, do it in a separate later call and re-verify.
- **`FormTextInput` placeholder is UNSETTABLE via MCP.** `set_attributes name="placeholder"` → generic "internal error"; via the `attributes` settings channel → "placeholder is a reserved attribute name"; and there is no `placeholder` key in the input's settings (only `domId`, `visibility`, `name`, `required`, `type`). Native workaround: overlay a `Paragraph` (pointer-events:none, absolute — `left`=icon pad, `right`=trailing pad, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`) over a **transparent, borderless** real input (`background-color:transparent`, `border-*-width:0px`, `border-*-style:none`, `box-shadow:none`, `height:auto`, padding to clear the icon). Real input stays focusable/typeable underneath. Set the input's `name`/`domId` via `set_settings` (those DO work). Log the placeholder limitation to `impossible_cases.md`.
- **Input `name`/`domId` DO set** via `set_settings` keys `name` and `domId` (static_text). `required` and `type` are settings too, not attributes.

## Auto-layout → flex

itemSpacing→gap · paddingX/Y→padding · primaryAxisAlignItems CENTER/MAX/SPACE_BETWEEN → justify-content center/flex-end/space-between · counterAxisAlignItems CENTER/MAX → align-items center/flex-end · sizing FILL→width:100%, HUG→fit-content.

**FIXED sizing → fluid, never rigid (this is the #1 responsive killer).** A Figma frame with a fixed width (1440, 1200, 600…) is a *canvas artifact*, not a design intent to lock that pixel width. Map it to `width:100%; max-width:{value}px` so it fills small screens and caps on large — NOT bare `width:{value}px`. Same for height: containers get `min-height` (or auto), never a hard `height`, so text reflow at narrow widths doesn't clip. Bare `width/height:{value}px` is allowed ONLY on intrinsically-fixed UI (icons, avatars, logos, fixed-ratio media with object-fit). If you set a px width on a section, container, card, or text block, it is a bug — the base is now rigid and no breakpoint override can make it responsive.

Figma RGBA floats → hex: `#{r*255:02x}{g*255:02x}{b*255:02x}`.

## Standard variable set (create at project start if absent)

Colors: `--color-primary` `--color-primary-dark` `--color-secondary` `--color-text` `--color-text-muted` `--color-surface` `--color-surface-alt` `--color-surface-dark` `--color-border` `--color-error` `--color-success` `--color-warning` (values from the design, not defaults).
Spacing: `--space-xs 4` `sm 8` `md 16` `lg 24` `xl 32` `2xl 48` `3xl 64` `4xl 96` `5xl 128` `6xl 192`.
Font size: `--font-size-xs 12` `sm 14` `md 16` `lg 18` `xl 20` `2xl 24` `3xl 30` `4xl 36` `5xl 48` `6xl 60` `7xl 72`.
Radius: `--radius-sm 4` `md 8` `lg 16` `full 9999`. Motion: `--duration-fast 150ms` `base 250ms` `slow 400ms` · `--easing-standard cubic-bezier(0.4,0,0.2,1)`.

**Matching rules — accuracy first:** color within ±15/channel of an existing variable → reuse it; otherwise NEW variable with the exact design hex. Spacing/type within ±10% of a scale step → the step; otherwise NEW variable with the exact px (e.g. `--space-hero-120`). Never round a design value onto the scale when it's >10% off — that's how 4% matches happen.

## CMS / Symbol heuristics

CMS: ≥3 same-structure instances + editor-updated content + per-item image or detail page → Collection + Collection List, `xattr` bindings (`{ "name": "textContent"|"src", "binding": "field-slug" }`). Symbol: ≥2 instances, same structure, non-editorial. Once: static div-block.

## Interactions (native only — no custom JS/CSS, ever)

Hover → class `:hover` + transition state in the Style panel (portable, copies with DOM). Scroll reveal / click / page-load → native IX2 with Limit: once.

**HOVER STATES ARE PART OF THE BUILD — never ship interactive elements without them.** Figma static frames don't encode hover, so check for hover first, then derive:
- Source order: Figma interactive-component hover variant / prototype interaction (via `get_motion_context` or component variants) → if none, apply the standard derived pattern below and tell the user it's derived, not designed.
- Mechanics (native, via `data_style_tool`): put a **transition on the BASE class** so it eases in AND out, then set the hover via `update_style` with `pseudo: "hover"`. Transition must be **longhand** (`transition-property`, `transition-duration`, `transition-timing-function`) — the `transition` shorthand lands in the Custom Properties panel (see shorthand rule). Typical: duration 150–250ms, ease `ease`/`cubic-bezier(.2,.6,.2,1)`.
- Standard derived patterns (transition transform/opacity/color/box-shadow/border-color/background — cheap to animate):
  - **Button/CTA:** `transform: translateY(-2px)` + stronger/larger `box-shadow` (or `filter: brightness(1.08)`). Never animate width/height/padding.
  - **Card:** `transform: translateY(-4px)` + brighten `border-color` + deeper `box-shadow`.
  - **Text link:** `color` shift (lighter) and/or move the trailing arrow icon `transform: translateX(3px)`.
  - **Icon/nav item:** `opacity` 0.7→1 or `color` shift.
- Keep it consistent site-wide: same element type = same hover timing/easing (log to registry `## Interactions`). Touch devices ignore hover — never hide essential content behind it.

### Animation intake — from DESCRIPTION or REFERENCE SITE (not Figma)

Figma frames rarely encode motion, so take animation direction from two non-Figma sources and map it intelligently to native Webflow. Never copy a reference's JS/CSS — rebuild the **intent** natively.

**Sources:**
- **User description** — parse the vibe into `trigger + target + property + timing`. E.g. "cards fade up and stagger on scroll" → scroll-into-view, opacity 0→1 + translateY(24→0), 100ms stagger, once. "nav shrinks on scroll" → scroll-progress on navbar. Pick sensible defaults; ask ONLY if a choice changes the build.
- **Reference site URL** — WebFetch the page (+ its CSS) and/or screenshot key states, identify what animates, on what trigger, and rough duration/easing/stagger, then replicate the intent with native IX2/transitions. Tell the user it's an approximation, not a pixel copy.

**Intelligent mapping — route each motion to the RIGHT native mechanism:**
- **hover / focus / active / state change** → class `:hover`/`:focus` + transition via `data_style_tool` → **buildable now** (see hover rules above).
- **scroll-into-view reveal, scroll-progress, page-load, click/tap toggle, mouse-move parallax** → native **Webflow Interactions 2.0 (IX2)**, which is **Designer-only via MCP** → write an exact spec to `pending_designer_work.md`: trigger, target element/class, from→to values, duration, easing, delay, stagger, `Limit: once`, and a reduced-motion note. Never fake IX2 with embeds/`<script>`.

**Quality defaults (apply unless told otherwise):**
- Animate ONLY `transform`/`opacity`/`filter` (never width/height/top/left/margin/font-size — jank).
- Durations: UI 150–300ms, entrances 400–700ms, hero 600–900ms. Easing: entrances `ease-out`/`cubic-bezier(.2,.6,.2,1)`; loops `ease-in-out`.
- Stagger by count: 2–3 items 100ms · 4–6 80ms · 7–12 60ms · >12 40ms (max ~150ms).
- Scroll reveals `Limit: once`. Respect `prefers-reduced-motion` — offer a reduced/none variant.
- **Intensity dial from the user:** "high/rich animation" → entrance reveals + hover + subtle scroll parallax, still perf-safe; "subtle" → opacity + short translate only. State which intensity was applied.
- Consistency: same motion role = same timing/easing site-wide (registry `## Interactions`).

**Report split every time:** list what was applied NOW (hover/transitions/state) vs what's queued as Designer-only IX2 spec (scroll/load/click), so nothing is silently missing. That is the complete list — no `<script>`, no IntersectionObserver embeds, no keyframe CSS injection. Animate only transform/opacity/filter, max 3 props; never width/height/margin/padding/top/left/font-size. Same interaction type site-wide = same timing (registry `## Interactions`). Stagger: 2–3 items 100ms · 4–6 80ms · 7–12 60ms · >12 40ms; max 150ms. An effect IX2 + hover states genuinely can't do → tell the user it's out of native scope and offer the nearest native alternative; do not write code.

## Impossible Cases

**Single source of truth: `docs/memory/impossible_cases.md`** — read that file for the full list. Log new cases there with native alternative offered. Never force impossible features.

## API mode fallback (no MCP)

```
GET  /v2/sites/{site_id}/pages                       — list pages
GET  /v2/pages/{page_id}/dom                         — read DOM
POST /v2/pages/{page_id}/dom                         — ⚠ REPLACES page content: always GET → merge → POST
POST /v2/sites/{site_id}/variables                   — create variable
POST /v2/sites/{site_id}/pages/{page_id}/elements     — create element
PATCH /v2/sites/{site_id}/pages/{page_id}/elements/{id} — update element
DELETE /v2/sites/{site_id}/pages/{page_id}/elements/{id} — delete element
```
(`custom_code` endpoints exist in the API — never call them; custom code is banned.)
Auth `Authorization: Bearer $WEBFLOW_API_KEY`. Rate: 60/min. Class panel styles CANNOT be set via REST — output exact Designer steps instead and log to ledger; never claim styles applied.

| Code | Cause → fix |
|---|---|
| 401 | bad token → regenerate |
| 403 | missing scope (pages:write etc.) |
| 404 | wrong page/site id → re-fetch list |
| 422 | invalid node type/fields → check node type against this table |
| 429 | rate limit → wait, 60/min. Implement backoff: 1st retry 10s, 2nd 30s, 3rd 60s |

**API merge safety (POST /dom):**
1. GET current DOM → store in memory
2. Build desired DOM state
3. Merge: keep any existing elements not in your build, replace/add elements you're building
4. POST merged DOM — never POST only your new elements (destroys existing page content)
5. Verify merge result: GET DOM again, confirm both old and new elements present

## Portability traps (cross-site copy)

Copies with DOM: structure, text, static image URLs, class styles incl. :hover transitions. Does NOT copy: IX2 (project DB), Slider/Tabs/Navbar init (`w-*` ids assigned by Designer only), CMS bindings (collection ids differ), Symbols (site-specific ids). Consequence: slider/tabs/navbar created via API/MCP are shells until opened + re-initialized in Designer → always status `partial` + ledger entry. Section built for multi-site reuse → prefer class-style `:hover` over IX2 where possible and document IX2 specs in registry `## Interactions` so they can be re-created in the target site's Designer (custom-code "portable" workarounds are banned).

## Error recovery

| Error | Recovery |
|---|---|
| Tool call fails mid-section | Read `build_state.json` → identify last successful element → retry from there |
| API returns 429 repeatedly | Pause 60s, retry. If still failing → switch to Designer manual mode for that section |
| Element creation returns 422 | Check node type against this table. Common: wrong parent type, missing required fields |
| Style update fails | Verify class exists (create if not). Verify property name is valid Webflow CSS |
| Figma MCP unreachable | Fall back to REST API with `FIGMA_TOKEN`. If no token → ask user for screenshot source |
| Webflow bridge disconnected | Reconnect bridge app. If persistent → build via API, log Designer manual steps for styles |
| Build state corrupted | Rebuild from Designer: `get_current_page` + `element_snapshot_tool` to reconstruct state |
