---
name: motion-build
description: Animation/interaction engine for Webflow — turn any motion reference (description, video/GIF, live URL, GSAP/CSS code, Figma prototype) into a compact Motion IR, route each animation to the cheapest tier that reproduces it exactly (CSS state / IX2 / Lottie / GSAP / bespoke), build what MCP can build, hand off the rest as an exact Designer click-script, then PROVE the motion runs with measured frames. Load only when motion is in scope.
---

# Motion Build — the animation engine

Claude reads the reference and decides WHAT the motion is. This skill decides HOW it gets into Webflow, who builds it, and how it is proven. Same contract as the rest of the pack: nothing simplified, nothing silently dropped (agent Rule 12), converge until it matches.

## Hard platform facts (verified 2026-07-25 — do not re-litigate)

- **IX2 cannot be created through the API.** `designer_tool` has zero interaction actions; `INTERACTIONS` exists only as a `get_more_tools` category. Any IX2 animation is a human Designer step, forever — so the deliverable must be a click-script so exact it takes ~60s, not a paragraph of intent.
- **Scripts ARE fully automatable.** `data_scripts_tool` can `register_hosted_script` (URL + SRI hash + version), `register_inline_script` (**max 2000 chars**), `add_page_script` / `add_site_script`, and read/write freeform head/footer blocks. So a GSAP-driven animation is end-to-end agent-buildable while a native IX2 one is not. Plan around that inversion instead of fighting it.
- **Webflow owns GSAP** and it is free on Webflow sites — GSAP is the platform's own motion engine, not a foreign dependency. It is still code, so it stays gated (§ Tier choice) and logged.
- Class `:hover`/`:focus`/`:active` + `transition` longhands ARE settable via `data_style_tool` — all state motion is free, native, portable, instant.
- `@keyframes` cannot be declared by the style tool (no stylesheet surface) → keyframe motion is IX2, Lottie, or code. Never fake it with a shorthand.

## Phase 1 — Motion intake (Claude's job: understand, then compress)

**One pass over the reference. Never re-read it.** Extract per animation:

`trigger` (hover/focus/click/page-load/scroll-into-view/scroll-scrub/timed-loop/mouse-move/form-state) · `target` (class, and count if a group) · `from → to` per property · `duration` · `easing` (name + bezier) · `delay` · `stagger` · `iteration` (once/N/infinite) · `direction` (normal/alternate) · `scrub range + pin` (scroll) · `threshold` (how far in view it fires) · `reduced-motion` fallback.

Per source:
- **Description** ("cards fade up staggered, hero text splits in") → parse to the fields above; fill unstated values from § Quality defaults and label them `derived`. Ask only when a choice changes the tier (e.g. "should the hero pin while scrolling?").
- **Video / GIF / screen recording** → count frames for real timing (`ffprobe`/frame extraction if available): note start→end frame of each move, convert to ms; read easing from the frame spacing curve (even spacing = linear, back-loaded = ease-out). Never eyeball a duration when frames exist.
- **Live URL** → the CSS/JS is the spec: grep stylesheets for `@keyframes`/`animation:`/`transition:`; grep JS for `gsap.`/`ScrollTrigger`/`IntersectionObserver`/`requestAnimationFrame`/`scrollY`. Record the actual numbers (durations, eases, stagger, scrub ranges), not impressions.
- **GSAP / CSS code pasted** → read it literally; every tween, ease name, stagger and ScrollTrigger config carries over 1:1.
- **Figma prototype** → `get_motion_context` / prototype links: trigger, transition type, duration, easing, smart-animate pairs.

**Output = Motion IR, one line per animation** (goes in the intake spec next to `effects:`):

```
motion:
  M1 hover        .btn-primary        bg #1E40AF→#1D4ED8 · translateY 0→-2px   200ms ease-out              tier:CSS
  M2 scroll-in    .card ×6            opacity 0→1 · translateY 24→0            600ms ease-out stagger 80ms once  tier:IX2
  M3 loop         .hero__orbit        vector orbit + dash-draw                 4s linear infinite          tier:Lottie
  M4 scroll-scrub .hero__bg           y 0→-120px                               scrub 0→100% of section, smooth .3  tier:GSAP
  M5 canvas       #particles          180 dots drift + link <120px             rAF loop                    tier:code
```

IR is the single source of truth downstream — build, verify and report all read it. It is cheap to keep in context and it kills re-analysis.

## Phase 2 — Tier routing (pick the LOWEST tier that reproduces it exactly)

| Tier | How it ships | Use for | Agent can build alone? |
|---|---|---|---|
| **CSS** | `data_style_tool` `pseudo: hover/focus/active` + `transition-*` longhands on the base class | every state change: buttons, cards, links, icons, inputs, nav items | ✅ now, in the section's existing class batch |
| **IX2** | Designer click-script (§ Phase 4) + `[critical]` ledger entry | scroll reveals, parallax, page-load sequences, click toggles, mouse-move tilt — when the project wants zero code | ❌ human clicks, agent verifies |
| **Lottie** | `.json` asset → native `Lottie` element via `data_element_builder` | vector motion, dash-draw, morphs, icon loops, illustration loops | ✅ if the asset upload probe passes (§ Lottie probe) |
| **GSAP** | `register_hosted_script` (pinned + SRI, once per site) + compact init in page footer, keyed to stable classes | scroll-scrub timelines, pinned sections, split-text, SVG morph, Flip layout moves, physics, precise sequencing | ✅ end-to-end, no Designer step |
| **code** | contained embed (build-reference § Ladder T4) | `<canvas>`, WebGL, bespoke rAF | ✅ authorized set only |

**Ask ONCE per project, then cache the answer in `registry.md ## Motion-Preference`:**

> *"Motion delivery for this project: **IX2** (100% native, no code — you apply each scroll/load animation in the Designer from an exact 6-field click-script I generate), or **GSAP** (I build everything end-to-end, adds one pinned Webflow-owned GSAP script to the site, nothing for you to click)? Hover/state motion is native class CSS either way."*

Cached preference decides IX2-vs-GSAP for every later section — never ask twice, never assume. Preserving a source that already used GSAP → GSAP path is already authorized (it is fidelity, not a new dependency). No preference recorded and the user is unreachable → IX2 (native default), and say so in the report.

## Phase 3 — Build

**CSS tier** — ride the section's existing single class batch, zero extra calls:
transition on the BASE class (so it eases in AND out), longhand triple `transition-property` / `-duration` / `-timing-function`; state values via `update_style` with `pseudo`. Animate only `transform`/`opacity`/`filter`/`color`/`background-color`/`box-shadow`/`border-color`. Never `width`/`height`/`top`/`left`/`margin`/`padding`/`font-size` — layout thrash.

**Lottie tier** — ① probe once per site: upload the `.json` via `asset_tool`, then `data_element_builder` a `Lottie` element and set its source. Result (works / rejected + error) → `error_learnings.md`, never re-probed. ② Rejected → host the JSON as a registered script asset or fall back to the project's IX2/GSAP preference, and say which. ③ Set loop/autoplay/direction/speed via element settings; verify it plays (§ Phase 5).

**GSAP tier** — one registration per SITE, reused by every animation:
1. `register_hosted_script` — pinned exact version URL + `integrity_hash` + semver + `display_name: "gsap-core"`; add ScrollTrigger as a second registration only if a scroll tier needs it.
2. `add_site_script` at `footer` (site-wide, one call) — never per page, never per animation.
3. Init code: ONE registered inline script per page (**2000-char ceiling — write it compact**, or host it) that reads the IR's animations for that page. Rules: wrap in IIFE · select by the build's real BEM classes (never `div`, never nth-child) · `gsap.matchMedia()` for breakpoint-scoped motion · `ScrollTrigger` with explicit `start`/`end`/`scrub` · guard every selector (`if (!el.length) return`) · `prefers-reduced-motion: reduce` → set end state instantly, no tweens · `ScrollTrigger.refresh()` after fonts load.
4. Log: `registry.md ## Motion-Applied` (IR id, tier, script id, page) + `## Custom-Code-Exceptions` (script registration, why IX2 couldn't) + `pending_designer_work.md` `[optional]` review line.
5. Layout, spacing, color, hover NEVER move into the script — those stay class styles. A GSAP script that sets static layout = ban violation.

**code tier** — build-reference § Ladder T4 containment rules, unchanged.

## Phase 4 — IX2 click-script (the handoff that must not cost a conversation)

Emit Webflow's own UI vocabulary, in order, with every field filled. One block per animation, ≤10 lines, no prose:

```
IX2 · M2 · cards fade-up stagger
1  Select .card (first instance) → Interactions panel → Element trigger → "While scrolling in view"
   (scroll reveal that fires once → use "Scroll into view" instead)
2  On "Scroll into view" → Start an animation → + New timed animation → name: "fade-up-24"
3  Action 1: Opacity → 0%  · check "Set as initial state"
4  Action 2: Move → Y 24px · check "Set as initial state"
5  Action 3: Opacity → 100% · Duration 0.6s · Easing "Out Quart" · Delay 0s
6  Action 4: Move → Y 0px  · Duration 0.6s · Easing "Out Quart" · Delay 0s  (same row time = runs together)
7  Trigger settings: Offset 15% bottom · Limit "Once" ✓ · Smoothing n/a
8  Apply to: "Class .card" (not "Only this element") → covers all 6, then set per-item Delay 0/80/160/240/320/400ms
9  Reduced motion: Interactions panel → gear → "Respect reduced motion" ✓
```

Rules: exact Webflow easing names (`Out Quart`, `In Out Cubic`, `Ease`) — never raw beziers, which the panel has no field for; durations in seconds; "Set as initial state" called out explicitly on every from-value (the #1 reason a reveal flashes); `Apply to class` vs `only this element` always stated; stagger expressed as per-instance delays. All IX2 blocks for a page are emitted **together, once** — one Designer sitting, not one per section.

## Phase 5 — Motion verify (measured, never claimed)

```
node docs/memory/webflow/motion-verify.js <url> <out.json> <W> "<selector>" <hover|click|load|scroll|all> <mobile:1|0> <port>
```

Script bundled with this skill (`~/.claude/skills/motion-build/motion-verify.js`; copy into the project's `docs/memory/webflow/` on first use). Needs `ws` (`npm i ws --no-save` at home dir) + Chrome. Modes: `load` samples from the first frame the DOM exists, `scroll` steps the section through the viewport, `hover` hovers **every interactive descendant in turn** (up to 8), `click` dispatches a real click, `all` runs the lot in one browser launch. Then it re-runs under `prefers-reduced-motion: reduce`.

Per element it reports: `moved` · `propsAnimated` (transform/opacity/filter **and** colour/shadow — a colour-fade hover is real motion) · `jankProps` (layout properties that changed) · **`durationDeclaredMs`** (read straight from computed `animation-duration`/`transition-duration` — EXACT) · `durationObservedMs` (proof it ran; coarse, sampling-bound) · `declared` (animation/transition strings) · `ix2` (`data-w-id` present = an interaction really is attached) · `initialStateFlash`, plus page-level `reducedMotion` and a one-line `verdict`.

Gates:
- [ ] Every IR row `moved: true` on the tier that owns it. `moved: false` on an IX2 row = the Designer step was never applied → re-surface the click-script, do NOT mark the section done
- [ ] `jankProps` empty (only transform/opacity/filter/colour moved — never width/height/margin/padding/font-size/top/left)
- [ ] **`durationDeclaredMs` matches the IR value exactly** where a CSS animation/transition owns the motion. Judge on declared, never on `durationObservedMs` — observed includes trigger latency and hover-out, so a correct 200ms hover can read ~500ms. Observed is only asked one question: did it move at all? (GSAP tweens set per-frame inline transforms with no declared duration → observed is the only signal there; tolerance ±40%.)
- [ ] No `initialStateFlash` (element visible for a frame before its reveal = missing "Set as initial state")
- [ ] `reduced-motion-respected: true`
- [ ] Motion still correct at mobile: either scoped off deliberately (`gsap.matchMedia`/IX2 breakpoint) or verified running; parallax/scrub off below tablet by default
- [ ] Loop animations: no layout shift per cycle, no CPU pin (frame deltas stable)

Failure → fix at the owning tier, re-run. Two no-progress passes = STALLED, report each row with what is missing. An IR row that cannot be proven is not `built`.

## Recipe library (this is where the token/time saving lives)

`registry.md ## Motion-Recipes` — every animation, once solved, is stored as a named recipe: `name · tier · IR line · exact build payload (class props / click-script / GSAP snippet) · verified on [date]`. Before analysing any new animation, **grep this section first** — a matching recipe is a zero-analysis, zero-decision build. Standard set to seed on first use: `fade-up-24` · `fade-in` · `stagger-cards` · `btn-lift` · `card-lift` · `link-arrow` · `nav-shrink` · `parallax-bg-120` · `count-up` · `marquee-loop` · `icon-pulse` · `hero-split-in` · `pin-scrub-section`.

Consistency rule: same animation type = same duration + easing site-wide. A second, differently-timed "card reveal" is a bug, not a variant.

## Quality defaults (fill unstated values, label them derived)

Durations: micro-state 150-250ms · entrance 400-700ms · hero 600-900ms · loop 3-6s. Easing: entrance `ease-out` / `cubic-bezier(.2,.6,.2,1)` (Webflow `Out Quart`), exit `ease-in`, loop `ease-in-out`, scrub linear. Distance: reveal 16-32px, parallax ≤120px, lift 2-6px. Stagger: 2-3 items 100ms · 4-6 80 · 7-12 60 · >12 40, max 150. Scroll reveals fire once, threshold 10-20% in view. Max 3 animated properties per step. Always honor `prefers-reduced-motion`. Loops pause when `document.hidden`.

## Token & time discipline

Recipe grep before analysis · one pass per reference, IR reused everywhere · CSS tier rides the existing class batch (0 extra calls) · one GSAP registration per site, one init script per page, one `add_site_script` · all IX2 blocks emitted in one handoff · motion-verify runs once per page after the single publish, `all` mode covers every trigger in one browser launch · Lottie probe once per site, cached to `error_learnings.md`.

## Report

```
MOTION — [page/section]   preference: IX2|GSAP (cached)
IR rows      N total → CSS: n built · Lottie: n built · GSAP: n built · IX2: n handed off · code: n
VERIFIED     moved n/n · jank 0 · durations ±20% ✓ · reduced-motion ✓ · mobile ✓
IX2 PENDING  [click-script blocks, or none]
RECIPES      reused: [names] · new: [names added to registry]
DERIVED      [values the reference didn't specify]
```

Unproven or unapplied rows keep the section at `partial` — never "complete" (agent Rules 10/12).
