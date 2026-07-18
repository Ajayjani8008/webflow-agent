---
name: responsive-pass
description: Finish a Webflow section at every breakpoint — read breakpoints from the Designer, apply design-specified or standard responsive overrides via style tool breakpoint overrides, verify each. Runs after pixel-verify on every section. Auto-enforces touch targets.
---

# Responsive Pass

A section is not done at desktop. Run after pixel-verify passes, per section.

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

**Structural:** no horizontal overflow · no text clipping/orphan wraps · image aspect correct · spacing rhythm preserved · nav usable (native navbar hamburger — never custom-build) · absolute elements don't bleed.
**Visual:** hierarchy holds (H1 largest, body readable ≥14px) · contrast still passes · shadows/radii scale OK · images not pixelated.
**Interactive:** tap targets ≥44 (§4) · hover content has tap equivalent · inputs tappable · parallax/heavy motion off below tablet.
**Automation:** design-specified breakpoints get property diff (like pixel-verify); derived get this checklist; overflow check via snapshot or user confirm.

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
breakpoints: [detected] · design-frames: [list | none → derived]
tablet:   [overrides — design|derived] ✓ overflow ✓ touch ✓ layout · auto-fixes: [list|none]
mobile-l: [same]
mobile-p: [same]
large:    [design | inherited — skipped if no frame]
derived-values: [all derived, for user awareness]
designer-steps-pending: [none | ledger items]
touch-targets: [N enforced to ≥44px]
```

Append summary to build_state.json `responsive_reports`.
