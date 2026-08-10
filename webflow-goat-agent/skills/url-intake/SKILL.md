---
name: url-intake
description: Intake from a LIVE WEBSITE URL used as design reference ("build the home page like this site"). Load ONLY when the design source is a live site URL — never on Figma, screenshot, or HTML builds. Produces the same spec format as design-intake; downstream (pixel-verify, responsive-pass) is identical.
---

# URL Intake — live website as design reference

Figma-grade accuracy: computed CSS from the real page = ground truth, zero guessing, zero vision estimates. This skill replaces design-intake §A/B/C for URL sources — do NOT also load design-intake source sections (its §D assets, §E validation, §F spec format still apply and are summarized here).

## MODE FIRST — REPLICA or ADAPT. Get this wrong and nothing else matters.

**Default is REPLICA.** "Build this from <url>", "reference → Webflow", "make my site like this" all mean
**rebuild the reference: its structure AND its text**, so the user can see their reference standing up in
Webflow. Do not ask which content to use, and never offer a menu whose options all point away from the
reference — that is how a header shipped at **1.4% string coverage** on 2026-08-07 while every other gate
read PASS.

| Mode | When | Content |
|---|---|---|
| **REPLICA** (default) | the user gave a URL as the thing to reproduce | the reference's own strings, verbatim, all of them. `content-coverage.js` enforces 100% |
| **ADAPT** | the user says so in their own words — "use my content", "my nav items", "keep the layout only" | their content in the reference's structure; slot COUNTS still match the reference |

Switching to ADAPT requires the user's words, not the agent's inference. Announce the mode in one line
(`mode: replica`) and write it into the spec — `pixel-verify` and `content-coverage` both read it.

**What is never copied in either mode:** the reference's logo/wordmark asset file, trademarked marks, and its
photography/illustration files. Rebuild those as a text wordmark or the user's own asset, and say so in one
line. Text, structure, geometry, and behaviour ARE the reference — that is what a replica is.

**Intake must therefore capture the content, not just the boxes:**
`node "$WF/scripts/content-coverage.js" inventory ref-cache/{domain}/{section}-1440.json specs/{section}.inventory.json`
→ every distinct string plus the class-group fingerprint. This runs at intake, before any plan is written,
and the plan is built FROM it. A plan with fewer strings than the inventory is an incomplete plan.

## REF-CACHE — fetch-once, like figma-cache

Everything lands in `$WF/sites/<site-id>/ref-cache/{domain}/` (`WF="$HOME/docs/memory/webflow"`; per site since v1.9.0). Before any live fetch, check the cache. Scripts live in `docs/memory/webflow/` (need `ws`: `npm install` in `$WF` + Chrome installed).

1. **Section map (one run):** `node "$WF/scripts/ref-extract.js" "<url>" ref-cache/{domain}/page-map.json 1440 - 0 9251` — body walk, 800-node cap. From the output's top-level paths (header / section / footer, depth ≤2) list the page's sections + their selectors. Truncated flag = expected on full pages; the map's purpose is selectors, not values.
2. **Per-section extract (the values):** `node ... ref-extract.js "<url>" ref-cache/{domain}/{section}-1440.json 1440 "<selector>" 0 <port>` — per element: tag, class, text copy, href/img src, bounding box, and every non-default computed style (layout, flex/grid, gap, all paddings/margins, typography, colors, gradients, borders, per-corner radius, shadows, transitions). **Confidence: HIGH — these are exact.** NEVER re-extract a section already in ref-cache.
3. **Reference screenshots (visual truth for pixel-verify):** `node "$WF/scripts/shot-el.js" "<url>" ref-cache/{domain}/shots/{section}-1440.png 1440 "<selector>" 0 <port>` — repeat at 767/375 with mobile flag `1`. pixel-verify compares the build against these exactly like a Figma render.
4. **Responsive = extract, don't derive:** re-run ref-extract at 991 / 767 / 478 for each section whose layout shifts. Exact breakpoint values from the source — responsive-pass applies them, no standard-pattern fallback needed (say so in the spec).
5. **Design tokens:** output's `rootVars` = the site's CSS variables → map to our variable families (`--color-*`, `--space-*`, …). No rootVars → derive tokens from repeated computed values (dedup rules in build-reference). Portable mode → raw values as usual.
6. **Value normalization:** computed values can be fractional (`15.98px` from rem/viewport math) → round to the obvious design value (16px) and note it; prefer the rootVars token value when one matches. `line-height` comes back in px → convert to unitless/em if the token system uses it.
7. **Assets:** every `img src` in the extract → download → upload via `asset_tool`, use returned URL (never hotlink). Inline SVGs flagged `svg:true` → grab `outerHTML` via the same CDP route. If that genuinely fails, rebuild the shape natively (T2 children) rather than stalling; ask for the source file only when the mark is a logo you must not redraw.
8. **What a single extract CANNOT see — so capture the behaviour too (mandatory, not optional):** computed CSS shows the resting state only. Run the page in the same headless Chrome and record what it *does*:
   - `node "$WF/scripts/state-shot.js" "<url>" ref-cache/{domain}/states/{section} 1440 "<selector>" "base,auto,scroll:40" 0 <port>` → resting + hover + scrolled reference images (the parity targets for pixel-verify §1.8)
   - `node "$WF/scripts/motion-verify.js" "<url>" ref-cache/{domain}/{section}-motion.json 1440 "<selector>" all 0 <port>` → what moves, on which trigger, declared durations/easings = the timing source of truth
   - Then re-extract computed CSS *while hovering* is unnecessary — the state shots plus the stylesheet's `:hover` rules (§9) give exact values.
   Still opaque: exact font files (family names only — validate via `data_fonts_tool`; if the family is absent, substitute the nearest installed one, record `assumed:` and state it in one line. Do not stall the build on a font) and content behind interaction (open menus, slider positions) → drive those states with explicit `click:`/`focus:` states in state-shot, else ask.
9. **Effect sweep (same manifest as html-intake §C.2/C.2b/C.3, same completeness bar):** pull the page's stylesheets + inline `<style>` (`curl` the `<link rel=stylesheet>` hrefs) and its scripts, then run the FULL grep table of html-intake §C.2 — `:hover`/`:focus`/`:active` · `::before`/`::after`/`content:` · `transition`/`animation`/`@keyframes` (+ delay, easing, iteration) · `clip-path`/`mask` · `<canvas>`/`getContext(`/`requestAnimationFrame` · `addEventListener` scroll/mousemove/click · custom cursor · preloader/load sequences · reveal classes + `IntersectionObserver` · `filter`/`backdrop-filter`/`mix-blend-mode` — plus every `<script src>`/global, routed natively: **GSAP/ScrollTrigger/SplitText → native Interactions panel** (never re-injected) · AOS/ScrollReveal/WOW + `data-aos` attrs → scroll-into-view interaction · Swiper/Slick/Splide/Owl → native `slider` · Lottie-web/bodymovin → native `Lottie` + same `.json` · typed.js/Splitting/countUp/marquee → panel SplitText/stagger/loop/count-up · three.js/particles/tsParticles/WebGL → T4 canvas with the real config · Lenis/Locomotive smooth-scroll → impossible case (the reveals it drove are still built) · jQuery accordions/tabs/modals/nav → native Dropdown/Tabs/Lightbox/Navbar. Each hit → numbered `effects:` row with exact timing values and its ladder tier (build-reference § Effect Fidelity Ladder). Computed styles alone never reveal pseudo-elements or keyframes — the stylesheet does. Third-party site → structure/effects only, never its copy or brand assets.
10. **Content:** governed by MODE at the top of this file, not by who owns the reference. **REPLICA (default): every string comes from the source, verbatim, all of them** — `content-coverage.js` fails the build below 100%. ADAPT: the user's content in the reference's structure, slot counts unchanged. Never lorem, never invented microcopy. The only things never copied in either mode are the logo/wordmark file, trademarks and photography — substitute those and say so in one line. (This item used to read "third-party reference → user supplies real content", which is what turned a replica request into a 1.4% build on 2026-08-07.)

## Validation + spec (same contract as design-intake)

- Fonts exist in Webflow (`data_fonts_tool`) or user installs; colors valid; spacing numeric; impossible cases → impossible_cases.md.
- Spec output = design-intake § Output, `source: url {domain}/{selector}`, WRITTEN to `$WF/sites/<site-id>/specs/<section>.md` (v1.10.0) — never left in conversation only. Downstream flow unchanged — pixel-verify + responsive-pass don't know the source was a live site.
