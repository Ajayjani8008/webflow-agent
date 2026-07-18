# Impossible Cases — design features that cannot be built natively in Webflow

Every entry must have a native alternative offered. If no alternative exists, mark as "no-native-alternative" and flag to user.

## Format
<!-- design-feature | why-impossible | alternative-offered | section | date -->

## Known Impossible Cases

| Feature | Why Impossible | Native Alternative | Section | Date |
|---|---|---|---|---|
| CSS rotation/transforms | No native CSS transform property in Webflow class styles | Static position adjustment using margin/padding; or tell user to rotate in Designer manually | — | — |
| Blend modes (color-burn, color-dodge, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity) | Webflow only supports multiply, screen, overlay | Flatten to solid color; or pre-compose as image with baked blend effect | — | — |
| Scroll-snap | No native scroll-snap-type/scroll-snap-align support | Section anchors for scroll-to navigation; or manual scroll positioning | — | — |
| Variable fonts | Webflow fonts are fixed-weight per file | Use closest fixed-weight match (e.g., Inter 400 instead of Inter Variable 400); or install multiple font files for each weight | — | — |
| Complex clip-paths (polygon, path, ellipse) | Only basic shapes (circle, inset) via CSS | Use image with transparent background (SVG/PNG); or SVG mask (limited support) | — | — |
| 3D transforms (rotateX, rotateY, perspective) | Limited 3D support in Webflow class styles | Flatten to 2D representation; or use IX2 for basic 3D animation (limited) | — | — |
| Custom cursors | No native cursor property in Webflow | Accept default cursor; or document as Designer manual step | — | — |
| Scroll-linked animations (parallax, scroll-triggered complex sequences) | IX2 has limited scroll trigger; no native scroll-linked animation | Use IX2 scroll-triggered fade/move (simple); or accept static layout | — | — |
| CSS @layer, @scope, nesting | Not supported in Webflow CSS output | Flatten to standard CSS cascade; use flat class naming | — | — |
| Container queries (@container) | Not supported | Use media queries at breakpoints | — | — |
| color-mix(), light-dark(), oklch() | Not supported | Use solid color values (hex/rgba) | — | — |
| Logical properties (margin-inline, padding-block) | Not supported | Use physical properties (margin-left, padding-top) | — | — |
| aspect-ratio CSS property | Limited support | Use padding-bottom aspect ratio hack; or fixed height + object-fit: cover | — | — |
| Subgrid | Not supported | Use nested flex or grid | — | — |
| Text stroke (-webkit-text-stroke) | Not supported | Use text-shadow for outline effect; or use image/SVG for outlined text | — | — |
| Multi-stop gradients (>8 stops) | Webflow gradient UI has limited stops | Flatten to fewer stops; or use background-image with pre-rendered gradient image | — | — |
| Conic gradients | Not supported | Use radial gradient approximation; or use pre-rendered image | — | — |
| object-fit: contain with precise positioning | Limited object-position control | Use background-image instead of img tag for precise positioning | — | — |
| Sticky positioning with complex offset combinations | position: sticky works but offset limited to single direction | Use absolute positioning + scroll-triggered IX2 for complex sticky behavior | — | — |
| Complex form validation UI | Native forms have limited validation styling | Use IX2 for visual feedback on form states; or accept browser default validation UI | — | — |
| E-commerce checkout flow | Requires Webflow E-commerce plan + full Designer setup | Build product listing/detail pages only; checkout = Designer manual setup | — | — |
| User authentication UI | Requires third-party service (Memberstack, Firebase, etc.) | Build static UI for login/signup; authentication logic = external service integration | — | — |
| Real-time search/filter with AJAX | Requires JavaScript | Use native Webflow search for CMS collections; or build static filter UI | — | — |
| CSS :has() selector | Not supported | Use parent class + child targeting; or JavaScript (banned) | — | — |
| CSS aspect-ratio with fallback | Limited | Use padding-bottom hack with percentage | — | — |
| Multiple background images with different positions | Limited control | Use multiple div layers with individual backgrounds | — | — |
| CSS counters | Not supported | Use static numbering; or CMS field for number | — | — |
| details/summary native accordion | Not supported as native element | Use native dropdown component + IX2 for open/close animation | — | — |
| Dialog/modal native element | Not supported as native element | Use div-block + IX2 for modal behavior; or use native lightbox | — | — |
| Popover API | Not supported | Use div-block + IX2 for popover behavior | — | — |
| CSS scroll-driven animations | Not supported | Use IX2 scroll triggers (limited) | — | — |
| View Transitions API | Not supported | No native alternative; page transitions = Designer manual | — | — |
| CSS nesting (native) | Not supported | Use flat class naming convention | — | — |
| CSS custom properties with fallback values | Limited | Use static color values; or Webflow variables with fixed defaults | — | — |

## data_style_tool — no -webkit properties (2026-07-11)
`-webkit-background-clip` / `-webkit-text-fill-color` rejected by data_style_tool (internal error). Gradient-clipped TEXT not settable via API.
Native alt: solid fallback color via tool + apply gradient in Designer (Text color → gradient picker). Never embed CSS.
Also: SVG uploaded as <img> asset can't be recolored via CSS (color/fill don't apply).

## MCP has NO interaction/IX2 API — confirmed platform-block (2026-07-15)
Webflow MCP = Data tools (REST) + Designer tools (elements/styles) ONLY. Full webflow_guide_tool (59KB) grepped: zero hits for interaction/ix2/animation/trigger/hover/scroll. No endpoint exists to create ANY interaction programmatically — not even simple ones Designer supports.
Consequence: ALL IX2 (hover/scroll/load/click/parallax) always → `pending_designer_work.md` for manual Designer recreate. There is no automation path; do NOT re-investigate this in future sessions (wastes tokens).
Only motion that IS scriptable = class `:hover`/`:focus` + transition longhand via data_style_tool (already covered by CLAUDE.md Rule 3 + portable mode). Prefer these wherever the effect allows.
