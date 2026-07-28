---
name: motion-build
description: Animation/interaction engine for Webflow — turn any motion reference (description, video/GIF, live URL, GSAP/CSS code, Figma prototype) into a compact Motion IR, route each animation to the lowest native tier (class states → native Interactions powered by GSAP → Lottie → contained code for canvas only), emit an exact Designer build-script for the Interactions panel, then PROVE the motion runs with measured frames. Load only when motion is in scope.
---

# Motion Build — the animation engine

Claude reads the reference and decides WHAT the motion is. This skill decides which NATIVE surface carries it, what the user clicks, and how it is proven. Nothing simplified, nothing dropped (agent rule NOTHING SILENTLY OMITTED).

## Hard platform facts (verified 2026-07-25 — do not re-litigate, do not "improve on")

- **Webflow Interactions are natively GSAP-powered.** Webflow shipped *Interactions with GSAP* (summer 2025): a visual Interactions panel with a horizontal timeline, playhead scrubbing, live Designer preview, and **built-in ScrollTrigger, SplitText and staggers — no code, no CDN, no plugins**. This is the platform's motion engine. Sources: `webflow.com/updates/introducing-webflow-interactions-powered-by-gsap`, `webflow.com/feature/interactions-animations`, Help Center *Intro to Interactions with GSAP* / *Interactions with GSAP vs. Classic Interactions* / *interactions with GSAP glossary*.
- **NEVER inject GSAP yourself.** No CDN `<script>`, no `register_hosted_script` for gsap/ScrollTrigger, no hand-written tween code. The engine already ships in the platform; injecting a second copy duplicates the runtime, adds weight, and produces motion that is invisible and uneditable in the Designer. Writing GSAP by hand when the panel does it = ban violation, same as any other custom code.
- **No API surface for interactions — confirmed twice.** `designer_tool` exposes only canvas/page/breakpoint/component/selection actions, zero interaction actions. Asking Webflow's own tool registry for an INTERACTIONS capability returns *"we have shown you the full tool list."* So every timeline animation is applied by a human in the Designer. The agent's job is to make that take ~60 seconds and to verify it landed.
- **Interactions scope to components and variants**, so motion travels with a component across pages, across sites, and through Shared Libraries. Component-scoped motion IS portable — unlike Classic Interactions, which do not copy.
- Two systems can exist: **Interactions with GSAP** (current) and **Classic Interactions** (legacy IX2). Detect which the site has before writing a build-script (§ Panel detection).
- Class `:hover`/`:focus`/`:active` + `transition` longhands ARE settable via `data_style_tool` — all state motion is agent-built, instant, portable.
- `@keyframes` cannot be declared by the style tool (no stylesheet surface). Keyframe motion belongs in the Interactions panel or Lottie — never in injected CSS.

## Phase 1 — Motion intake (Claude's job: understand, then compress)

**One pass over the reference. Never re-read it.** Extract per animation:

`trigger` (hover/focus/click/page-load/scroll-into-view/scroll-scrub/timed-loop/mouse-move/form-state) · `target` (class or component, and count if a group) · `from → to` per property · `duration` · `easing` · `delay` · `stagger` · `iteration` (once/N/infinite) · `direction` · `scrub range + pin` · `threshold` (how far in view it fires) · `reduced-motion` fallback.

Per source:
- **Description** ("cards fade up staggered, hero text splits in") → parse to the fields above; fill unstated values from § Quality defaults and label them `derived`. Ask only when a choice changes the tier (e.g. "should the hero pin while scrolling?").
- **Video / GIF / screen recording** → count frames for real timing (`ffprobe` / frame extraction when available): start→end frame per move → ms; easing from frame spacing (even = linear, back-loaded = ease-out). Never eyeball a duration when frames exist.
- **Live URL** → the CSS/JS is the spec: grep stylesheets for `@keyframes`/`animation:`/`transition:`; grep JS for `gsap.`/`ScrollTrigger`/`IntersectionObserver`/`requestAnimationFrame`. Record real numbers (durations, eases, stagger, scrub ranges). **A reference site using GSAP-by-code is still rebuilt in the native panel** — same engine, native surface.
- **GSAP / CSS code pasted** → read it literally; every tween, ease, stagger and ScrollTrigger config maps onto a panel control. Translate, never transplant.
- **HTML delivery (files on disk)** → the CSS/JS is the spec AND the reference is runnable: read every stylesheet/script in full (html-intake §C.0), then run it headless via `file://` — `motion-verify.js` for the reference fingerprint (what moves, declared durations, triggers) and `state-shot.js` for hover/scroll state images (html-intake §C.6). Library-driven motion (GSAP/AOS/Swiper/Lottie/particles) is routed by html-intake §C.2b; the fingerprint becomes the parity baseline pixel-verify §1.8 scores against. Never re-inject the reference's library.
- **Figma prototype** → `get_motion_context` / prototype links: trigger, transition type, duration, easing, smart-animate pairs.

**Output = Motion IR, one line per animation** (in the intake spec beside `effects:`):

```
motion:
  M1 hover        .btn-primary   bg #1E40AF→#1D4ED8 · translateY 0→-2px   200ms ease-out              tier:CSS
  M2 scroll-in    .card ×6       opacity 0→1 · translateY 24→0            600ms ease-out stagger 80ms once  tier:Interactions
  M3 loop         .hero__orbit   vector orbit + dash-draw                 4s linear infinite          tier:Lottie
  M4 scroll-scrub .hero__bg      y 0→-120px                               scrub over section, smooth  tier:Interactions
  M5 split-in     .hero__title   per-word rise + fade                     500ms, 40ms stagger         tier:Interactions (SplitText)
  M6 canvas       #particles     180 dots drift + link <120px             rAF loop                    tier:code
```

IR is the single source of truth for build, verify and report.

## Phase 2 — Tier routing (lowest tier that reproduces it exactly)

| Tier | Surface | Use for | Who builds |
|---|---|---|---|
| **CSS** | `data_style_tool` `pseudo: hover/focus/active` + `transition-*` longhands | every state change: buttons, cards, links, icons, inputs, nav | ✅ agent, inside the section's existing class batch |
| **Interactions** | native Interactions panel (GSAP-powered): timeline, ScrollTrigger, SplitText, staggers | scroll reveals, scroll-scrub/parallax, pinning, page-load sequences, click toggles, mouse-move, loops, split-text, multi-step timelines | ❌ human clicks the panel from the agent's build-script; agent verifies |
| **Lottie** | `.json` asset → native `Lottie` element | vector illustration motion, dash-draw, morphs, icon loops | ✅ agent (probe upload once per site) |
| **code** | contained embed (build-reference § Ladder T4) | `<canvas>`, WebGL, bespoke rAF only — no native equivalent exists | ⚠️ eligible ≠ allowed: write the T1/T2/T3 why-not proof, **ask the user, get an explicit yes**, log it verbatim. No yes → native fallback |

**There is no "custom GSAP" tier.** Anything that would have gone there is an Interactions-panel build. If a motion seems to need hand-written GSAP, it is a panel feature you have not mapped yet — map it (§ Panel detection) before even considering code, and if it truly has no panel equivalent, log it to `impossible_cases.md` with the closest native motion. Only canvas/WebGL earns the code tier.

### Panel detection (once per site, cached to `registry.md ## Motion-Panel`)

Ask the user once, plainly: *"Does this site's Interactions panel show a horizontal timeline with ScrollTrigger / SplitText / Stagger controls (Interactions with GSAP), or the older action-list panel (Classic Interactions)?"* — one screenshot of the panel answers it. Cache the answer plus the exact control labels observed, and write build-scripts in that panel's vocabulary from then on. Unknown and user unreachable → write the script for Interactions with GSAP (current default) and note the assumption.

**Never invent panel labels.** The Help Center pages are fetch-blocked (403), so the first time a build-script is needed, ask the user for one screenshot of the open panel, record the real control names in `## Motion-Panel`, and reuse them forever. A build-script with invented field names costs a round trip; one screenshot costs none.

## Phase 3 — Build

**CSS tier** — rides the section's existing single class batch, zero extra calls: transition on the BASE class (eases in AND out), longhand triple `transition-property`/`-duration`/`-timing-function`; state values via `update_style` with `pseudo`. Animate only `transform`/`opacity`/`filter`/`color`/`background-color`/`box-shadow`/`border-color`. Never `width`/`height`/`top`/`left`/`margin`/`padding`/`font-size`.

**Interactions tier** — the agent prepares everything the panel needs, then hands off:
1. **Make the targets addressable:** every animated element carries a stable BEM class (and a component when the motion should travel). Groups that stagger must be true siblings sharing one class — the panel staggers a set, so the DOM has to present one.
2. **Set the resting state in CSS, not as an "initial state" hack:** the element's normal class styles are its END state. The panel animates from the offset, so no permanent `opacity: 0` is baked into a class (that is what leaves content invisible when motion fails).
3. **Prefer component scoping** when the motion belongs to a reusable block — it then travels with the component across pages/sites/Shared Libraries (§ platform facts). State that in the report.
4. Emit the build-script (§ Phase 4). All of a page's animations in ONE handoff block.
5. Log: `pending_designer_work.md` `[critical]` per animation (never `[optional]` — an unbuilt animation is a missing feature) + `registry.md ## Motion-Applied` once verified.

**Lottie tier** — ① probe once per site: upload the `.json` via `asset_tool`, build a `Lottie` element, set its source; record works/rejected + error in `error_learnings.md`, never re-probe. ② Rejected → Interactions panel or a documented impossible case. ③ Set loop/autoplay/direction/speed via element settings; verify it plays (§ Phase 5).

**code tier** — canvas/WebGL only, build-reference § Ladder T4 containment rules unchanged.

## Phase 4 — Designer build-script (the handoff that must not cost a conversation)

One block per animation, ≤10 numbered lines, panel vocabulary from `## Motion-Panel`, every value filled — no prose, no "then configure the easing".

Shape it like this (labels adjusted to the detected panel):

```
INTERACTIONS · M2 · cards fade-up stagger
1  Select one .card → Interactions panel → New interaction
2  Trigger: scroll into view · fires once · start when element is ~15% into the viewport
3  Add tween on .card: opacity 0 → 1
4  Add tween on .card: y 24px → 0   (same timeline position as the opacity tween — they run together)
5  Duration 0.6s · easing ease-out (Quart-style curve) · delay 0
6  Stagger the set: 80ms between items, order = DOM order  (do NOT hand-set 6 delays if a stagger control exists)
7  Target the class .card / the component instance so all 6 are covered by one interaction
8  Scrub: off (this is a timed reveal, not a scroll-linked one)
9  Reduced motion: enable the panel's respect-reduced-motion setting
10 Preview with the playhead, then publish
```

Rules: durations in the panel's own unit (seconds unless it shows ms) · easing named as the panel names it, never a raw bezier the panel has no field for · say explicitly whether the animation targets **one element, a class, or a component** · express stagger with the stagger control, falling back to per-item delays only if the panel lacks one · scroll-scrub animations state start/end and smoothing · SplitText animations state the split unit (chars/words/lines) and the per-unit stagger · every page's blocks emitted together so it is one Designer sitting.

## Phase 5 — Motion verify (measured, never claimed)

```
node docs/memory/webflow/motion-verify.js <url> <out.json> <W> "<selector>" <hover|click|load|scroll|all> <mobile:1|0> <port>
```

Bundled with this skill (`~/.claude/skills/motion-build/motion-verify.js`; copy into the project's `docs/memory/webflow/` on first use). Needs `ws` (`npm i ws pngjs pixelmatch --no-save` at home dir) + Chrome. `load` samples from the first frame the DOM exists, `scroll` steps the section through the viewport, `hover` hovers **every interactive descendant in turn** (up to 8), `click` dispatches a real click, `all` runs the lot in one launch, then it re-runs under `prefers-reduced-motion: reduce`.

Per element: `moved` · `propsAnimated` (transform/opacity/filter **and** colour/shadow — a colour-fade hover is real motion) · `jankProps` (layout properties that changed) · **`durationDeclaredMs`** (exact, from computed `animation-duration`/`transition-duration`) · `durationObservedMs` (proof it ran; coarse) · `declared` strings · `ix2` (`data-w-id` present) · `initialStateFlash`; plus page-level `reducedMotion` and a one-line `verdict`.

Gates:
- [ ] Every IR row `moved: true` on the tier that owns it. `moved: false` on an Interactions row = the panel step was never applied → re-surface the build-script; the section does NOT become done
- [ ] `jankProps` empty (only transform/opacity/filter/colour moved)
- [ ] Timing: where a CSS animation/transition owns the motion (CSS tier), **`durationDeclaredMs` must equal the IR value** — judge on declared, never observed (observed includes trigger latency and hover-out, so a correct 200ms hover reads ~500ms). **Panel-built interactions are JS-driven per-frame transforms with no declared duration** → observed is the only signal there; tolerance ±40%, and the real check is that the motion is present, smooth and un-janky
- [ ] No `initialStateFlash` (content visible for a frame before its reveal, or stuck invisible after)
- [ ] `reducedMotion.respected: true`
- [ ] Mobile: motion either deliberately scoped off at that breakpoint or verified running; scrub/parallax off below tablet by default
- [ ] Loops: no per-cycle layout shift, frame deltas stable
- [ ] **Reference parity (runnable reference only):** diff the built fingerprint against the reference fingerprint row by row (match by visual role, not selector) — same trigger, same animated properties, declared duration within ±10% (CSS tier), same iteration/loop, same reduced-motion behaviour. A row that exists in the reference and not in the built JSON is a dropped animation, not a styling nit
- [ ] `ix2` field is informational only — Classic Interactions emit `data-w-id`; a GSAP-panel interaction may not, so **never treat a missing `data-w-id` as failure. Measured movement is the evidence.**

**Reading the JSON without chasing ghosts** (verified 2026-07-28 on a `file://` reference): a row with `moved: false` + `jankProps: ["width"]` in `load` mode is page layout settling (scrollbar/reflow during the first frames), not an animation — judge jank only on rows that actually `moved`. `durationDeclaredMs` is trustworthy for CSS animation/transition rows (`declared.animation`/`declared.transition` populated); `null` + moved = JS/panel-driven, use observed. `reducedMotion FAIL` on a reference just means the source ignored the media query — mirror the source, then decide with the user whether the build should improve on it (state which).

Failure → fix at the owning tier, re-run. Two no-progress passes = STALLED, report each row with what is missing. An IR row that cannot be proven is not `built`.

## Recipe library (where the token/time saving lives)

`registry.md ## Motion-Recipes` — every solved animation stored as: `name · tier · IR line · exact build payload (class props / build-script / Lottie asset) · verified on [date]`. **Grep this section before analysing any new animation** — a match is a zero-analysis build. Seed set: `fade-up-24` · `fade-in` · `stagger-cards` · `btn-lift` · `card-lift` · `link-arrow` · `nav-shrink` · `parallax-bg-120` · `count-up` · `marquee-loop` · `icon-pulse` · `hero-split-in` · `pin-scrub-section`.

Consistency: same animation type = same duration + easing site-wide. A second, differently-timed "card reveal" is a bug, not a variant.

## Quality defaults (fill unstated values, label them derived)

Durations: micro-state 150-250ms · entrance 400-700ms · hero 600-900ms · loop 3-6s. Easing: entrance ease-out (Quart-ish), exit ease-in, loop ease-in-out, scrub linear. Distance: reveal 16-32px, parallax ≤120px, lift 2-6px. Stagger: 2-3 items 100ms · 4-6 80 · 7-12 60 · >12 40, max 150. Scroll reveals fire once, threshold 10-20% in view. Max 3 animated properties per step. Always respect reduced motion. Loops pause when the tab is hidden.

## Token & time discipline

Recipe grep before analysis · one pass per reference, IR reused everywhere · CSS tier rides the existing class batch (0 extra calls) · panel labels learned once from one screenshot, cached · all build-scripts for a page emitted in one handoff · motion-verify runs once per page after the single publish, `all` mode covering every trigger in one browser launch · Lottie probe once per site, cached.

## Report

```
MOTION — [page/section]   panel: Interactions-with-GSAP | Classic (cached)
IR rows      N total → CSS: n built · Lottie: n built · Interactions: n handed off · code: n
VERIFIED     moved n/n · jank 0 · timing ✓ · reduced-motion ✓ · mobile ✓
PANEL WORK   [build-script blocks, or none]
SCOPING      [component-scoped (travels) | page-level]
RECIPES      reused: [names] · new: [names added]
DERIVED      [values the reference didn't specify]
```

Unproven or unapplied rows keep the section at `partial` — never "complete" (agent rules IMPOSSIBLE CASES / NOTHING SILENTLY OMITTED).
