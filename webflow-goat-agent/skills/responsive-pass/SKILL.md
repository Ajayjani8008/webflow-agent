---
name: responsive-pass
description: Finish a Webflow section at every breakpoint — read breakpoints from the Designer, apply design-specified or standard responsive overrides via style tool breakpoint overrides, verify each. Runs after pixel-verify on every section. Auto-enforces touch targets.
---

# Responsive Pass

A section is not done at desktop. Run after pixel-verify passes, per section (lane T1/T2; in lane T3 it runs alone on the broken breakpoint).

**Shares pixel-verify's single publish.** Every shot this skill needs is captured in the SAME browser session as the typography + behaviour-parity shots, straight after the one publish (pixel-verify §0). Publishing again per breakpoint is a process bug.

## 0. FLUID-BASE GATE (first — breakpoints can't fix a rigid base)

#1 responsive killer = fixed px widths/heights copied from Figma frames. `width: 1200px` can't shrink — it overflows; no override saves it. Read back base (Desktop) styles for every class, confirm:

- [ ] No container/section/card/text block has bare `width: {n}px` → `width: 100%; max-width: {n}px`. Bare px ONLY on intrinsic UI (icon/avatar/logo/fixed-ratio media)
- [ ] No container bare `height: {n}px` → `min-height` or auto. Fixed height only on intrinsic media + `object-fit`
- [ ] Section/wrapper `width: 100%`; content centered via `max-width` + auto margins or container
- [ ] Images: `max-width: 100%`, `height: auto` (or fixed-ratio + `object-fit: cover`)
- [ ] **`object-fit: cover` trap:** image `height: 100%` needs parent with DEFINITE height. Desktop split-card = fine; stacked mobile flex child usually has only `min-height` (NOT definite) → image collapses. RULE: any `height:100%`+`object-fit:cover` image must, at breakpoints where container isn't definitely-sized, switch to `height: auto` OR container gets definite `height`/`aspect-ratio`. Default stacked-mobile fix: image `height: auto`, container `min-height: auto`
- [ ] Nothing positions siblings via fixed px width (use flex/grid + gap)

Any unchecked → fix BASE class at Desktop → re-run pixel-verify → then proceed.

## 1. Breakpoints — read, don't assume

`designer_tool > get_all_breakpoints` → site's actual breakpoints. Map to design frames: Desktop (base) · Tablet 991 · Mobile-L 767 · Mobile-P 478 · Large 1280+ · XL 1920+. Custom breakpoints without design frames → skip (desktop-first cascade covers them). Breakpoints design doesn't cover → note, don't force overrides.

## 2. Source of truth per breakpoint

- Design has tablet/mobile frames (intake `responsive:` filled) → exact values, ALL properties (layout, spacing, images, colors — not just type)
- Desktop-only design → standard patterns below + **tell user exactly which values were derived**

**Frame hunt is not optional.** intake `responsive: mobile-frame: NONE` is only acceptable if the hunt in design-intake §A.8 actually ran (name patterns, width ranges 320-480 / 700-900, mobile page in file, component variants). Deriving mobile values while a mobile frame sits in the Figma file = build failure. Not run yet → run it now, before applying a single override.

### 2.1 Spacing diff table (mobile frame present — the #1 mobile-accuracy gap)

Mobile mismatches are almost never "the layout broke" — they are spacing drift. Build an explicit per-class table from the mobile frame and diff after applying, same rigor as desktop property diff:

| Per class @ breakpoint | From mobile frame | Applied | Δ |
|---|---|---|---|
| `padding-top/right/bottom/left` | exact px | read-back | ±0.5px tolerance |
| `grid-column-gap` / `grid-row-gap` | exact px (both longhands) | | |
| `margin-*` (incl. negative/overlap) | exact px | | |
| `justify-content` / `align-items` / `text-align` | frame alignment | | |
| `flex-direction` / order (`order:` when the mobile frame reorders) | | | |
| `width` / `max-width` / `min-height` | fluid + max-width, never bare px | | |
| `font-size` / `line-height` / `letter-spacing` | exact from mobile text nodes | | |
| element hidden/shown at mobile | frame visibility → `display: none` at that breakpoint only | | |

Any Δ outside tolerance → fix at that breakpoint, re-read. Never accept "looks about right" when exact values exist.

## 3. Standard degradation patterns (design silent)

**Layout:** grid 4/3/2-col → 2-col tablet → 1-col mobile (2-col stays 2 at tablet) · flex row content+media → column (column-reverse if media focal) · equal-items row → wrap 50% or stack · sidebar → stack content-first · multi-col nav → native navbar hamburger.

**Typography:** H1/H2 −1 scale step tablet, −2 mobile · H3 −1 all · H4-6 −0/1 · body no change (−1 mobile OK) · small no change.

**Spacing:** section pad T/B −1 step tablet, −2 mobile · side padding lg→md→sm (24/16/16) · gaps −1 step or hold.

**Components:** buttons auto→100% width mobile, min-height 48 · images 100% + auto height or object-fit · cards stack · hero image height auto mobile.

## 4. Touch targets (AUTO-FIX, not just flag)

WCAG 2.5.8 / iOS HIG: interactive elements ≥44×44px, gap between targets ≥8px. After overrides, scan interactive elements at mobile breakpoints → under-size → auto-pad to 44px (buttons/links 44-48 min-height, inputs 44, nav tap area 44); gap <8px → auto gap/margin. Log every auto-fix in report. Never skip.

## 5. Apply

Per class per breakpoint: `data_style_tool > update_style` with `breakpoint_id` — override ONLY changed properties (cascade handles rest). API mode can't set class styles → exact Designer steps per breakpoint per class → pending ledger.

Order: ① layout (grid cols, flex direction, display) ② typography ③ spacing ④ components ⑤ touch targets (last). Desktop-first: never override where inherited value already correct; large breakpoints only if design specifies.

## 6. Verify every breakpoint

**SCORED COMPARE — mandatory wherever a reference frame exists.** A mobile/tablet frame in the design is a reference render exactly like the desktop one, so it gets the same gate, not a softer checklist:

1. Capture + score **every** breakpoint in ONE call (v1.10.0) — `node "$WF/scripts/verify-section.js" <published-url> "<sel>" <outDir> --section=<name> --widths=1440,991,767,390 --ref=<ref-dir> --audit` (pixel-verify §0). It reloads per width in a single browser launch and scores each against its reference frame. Single targeted re-check inside a fix pass only: `node "$WF/scripts/shot-el.js" <published-url> <out.png> <W> "<selector>" 1 <port>` — width per breakpoint (390 mobile-P, 767 mobile-L, 991 tablet), `mobile:1` for phone widths (CDP device metrics; `--window-size` does NOT set layout viewport).
2. **Before that call, put every reference frame in the `--ref` dir** named `<section>-<width>.png` — export the tablet/mobile Figma frames (or copy them from `figma-cache/04-screenshots/{section}--mobile.png`). A width with no reference comes back `UNSCORED`, which is *not* a pass.
3. **Read the verdict.** Each width must satisfy all three conditions: **≥97% global · height delta ≤2% · no 12×12 cell >25% mismatched** (the v1.9.0 strict gate, identical to desktop). The mobile a11y pass — where touch targets are actually measurable — is the same call's `--audit` at the smallest width. Paste the consolidated `EVIDENCE verify-section` block into the report verbatim; a breakpoint score without it is an unverified claim.
4. Any width FAIL → read its named hot-region boxes → §2.1 spacing diff on those classes → ONE batched fix → re-run the single call. Converge; two no-progress passes = STALLED (and STALLED is illegal while a CRITICAL/MAJOR diff is open — pixel-verify §4).

No reference frame for a breakpoint → `UNSCORED`: derived values, the checklist below, **open that shot and check it by eye** (pixel-verify §3 image discipline), and every derived value named in the report.

**Structural:** no horizontal overflow (`scrollWidth > clientWidth` check) · no text clipping/orphan wraps · image aspect correct · spacing rhythm preserved · nav usable (native navbar hamburger — never custom-build) · absolute elements don't bleed · icons non-zero and unsquashed (pixel-verify §1.6).
**Visual:** hierarchy holds (H1 largest, body readable ≥14px) · contrast still passes · shadows/radii scale OK · images not pixelated.
**Interactive:** tap targets ≥44 (§4) · hover content has tap equivalent · inputs tappable · parallax/heavy motion off below tablet · T4 canvas resizes with DPR at mobile (no blur, no fixed px) · IX2/keyframe effects still run or are intentionally disabled.
**Automation:** reference-frame breakpoints get scored compare + property diff; derived breakpoints get this checklist; overflow always machine-checked, never eyeballed.

## 7. Common failures → fixes

| Problem | Fix |
|---|---|
| Nav links overflow tablet | native navbar collapse setting at tablet |
| Hero image wrong height mobile | fixed height + object-fit: cover at breakpoint, or height auto |
| Split-card image collapses on mobile stack | image `height: auto` + media `min-height: auto` (§0 trap) |
| Two-col too narrow tablet | stack 1-col or reduce side padding |
| Gap too large mobile | gap override per breakpoint |
| Absolute element bleeds | position: relative at mobile |
| Hover-only content on touch | verify Webflow hover→tap conversion |
| Text too small | ≥14px body at mobile |
| Button too small | pad to 44px min-height (auto, §4) |
| Grid items overflow | fewer columns |
| Sticky header covers content | padding-top on section below |

## 8. Report

```
RESPONSIVE — [section]
breakpoints: [detected] · design-frames: [mobile: node id|NONE (hunt ran) · tablet: …]
tablet:   [overrides — design|derived] pixel-score NN.N% ✓ overflow ✓ touch ✓ icons · auto-fixes: [list|none]
mobile-l: [same]
mobile-p: [same]
large:    [design | inherited — skipped if no frame]
spacing-diff: [N/N classes within ±0.5px of mobile frame | deltas fixed: list]
derived-values: [all derived, for user awareness]
designer-steps-pending: [none | ledger items]
touch-targets: [N enforced to ≥44px] · a11y@390: PASS|FAIL [failures]
evidence: ```
<verbatim EVIDENCE pixel-diff block per scored breakpoint>
<verbatim EVIDENCE page-audit block @390>
```
```

Append the summary to this site's `build_state.json` → `sections[].responsive_report`. Scores without their EVIDENCE blocks do not count as verified (pixel-verify §3).
