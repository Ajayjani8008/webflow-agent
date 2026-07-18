---
name: responsive-pass
description: Finish a Webflow section at every breakpoint — read breakpoints from the Designer, apply design-specified or standard responsive overrides via style tool breakpoint overrides, verify each. Runs after pixel-verify on every section. Auto-enforces touch targets.
---

# Responsive Pass

A section is not done at desktop. Run after pixel-verify passes, per section.

## 0. FLUID-BASE GATE (do this first — breakpoints can't fix a rigid base)

The #1 cause of a "responsive design that failed" is a rigid desktop base: fixed px widths/heights copied literally from Figma frames. No breakpoint override can make a `width: 1200px` element shrink below 1200 — it just overflows. Before touching any breakpoint, read back the base (Desktop) styles for every class in the section and confirm:

- [ ] **No container/section/card/text block has a bare `width: {n}px`.** Fixed Figma widths → `width: 100%; max-width: {n}px`. Fixed px width allowed ONLY on intrinsic UI (icon/avatar/logo/fixed-ratio media).
- [ ] **No container has a bare `height: {n}px`.** → `min-height` or auto, so reflow doesn't clip. Fixed height allowed only on intrinsic media (with `object-fit`).
- [ ] Section/wrapper is full-width (`width: 100%`); inner content centered via `max-width` + `margin: auto` or a container class.
- [ ] Images: `max-width: 100%`, `height: auto` (or fixed-ratio + `object-fit: cover`).
- [ ] **`object-fit: cover` image trap:** an image with `height: 100%` needs a parent with a DEFINITE height. On desktop a split-card media stretches to the card height (definite) — fine. But when that media becomes a stacked flex child on mobile, its height is often only `min-height` (NOT definite) → the image collapses or won't fill. RULE: any image using `height: 100%` + `object-fit: cover` MUST, at every breakpoint where its container is not definitely-sized (stacked mobile), either switch to `height: auto` OR give the container a definite `height`/`aspect-ratio`. Default fix for stacked mobile cards = image `height: auto`, container `min-height: auto`.
- [ ] Nothing relies on a fixed px width to position siblings (use flex/grid + gap).

Any unchecked box → fix the BASE class via `data_style_tool` at Desktop first, re-run pixel-verify, THEN proceed. A section whose base isn't fluid cannot pass responsive.

## 1. Breakpoints — read, don't assume

`designer_tool > get_all_breakpoints` → use the site's actual breakpoints. **Map breakpoints to design frames:**

| Breakpoint | Default Width | Design Frame Name (typical) |
|---|---|---|
| Desktop (base) | Any | "Desktop", "Default", "Main" |
| Tablet | 991px | "Tablet", "iPad" |
| Mobile Landscape | 767px | "Mobile Landscape", "Mobile Horizontal" |
| Mobile Portrait | 478px | "Mobile Portrait", "iPhone", "Mobile" |
| Large Desktop | 1280px+ | "Large Desktop", "Wide", "1440" |
| Extra Large | 1920px+ | "Extra Large", "Ultra Wide" |

**Custom breakpoints:** if site has breakpoints not in default list → read from design. If design doesn't have frames for custom breakpoints → skip them (desktop-first cascade handles them naturally).

**Breakpoint detection:** if `get_all_breakpoints` returns breakpoints the design doesn't cover → note them but don't force overrides. Webflow cascades desktop → down, so uncovered breakpoints inherit from the next larger breakpoint.

## 2. Source of truth per breakpoint

- **Design has tablet/mobile frames** (intake spec `responsive:` filled) → apply those exact values. Same rigor as desktop: real values, no guessing. **Capture ALL properties** from the frame, not just typography — layout direction, spacing, image sizes, colors, shadows, everything
- **Design is desktop-only** → apply the standard degradation patterns below, and **tell the user exactly which values were derived**, not designed. User can override in Designer after

## 3. Standard degradation patterns (when design doesn't specify)

**Layout:**

| Property | Tablet | Mobile Landscape | Mobile Portrait |
|---|---|---|---|
| Grid 4 col | 2 col | 1 col | 1 col |
| Grid 3 col | 2 col | 1 col | 1 col |
| Grid 2 col | 2 col | 1 col | 1 col |
| Flex row (content+media) | column (or column-reverse to keep media first if image is focal) | column | column |
| Flex row (equal items) | wrap with 50% items or stack | stack | stack |
| Sidebar layout | stack (content first, sidebar below) | stack | stack |
| Multi-column nav | hamburger (native navbar) | hamburger | hamburger |

**Typography:**

| Property | Tablet | Mobile Landscape | Mobile Portrait |
|---|---|---|---|
| H1 | -1 scale step (e.g. 60→48) | -2 steps (60→36) | -2 steps (60→36) |
| H2 | -1 step | -2 steps | -2 steps |
| H3 | -1 step | -1 step | -1 step |
| H4-H6 | no change or -1 step | -1 step | -1 step |
| Body text | no change | no change or -1 step | no change or -1 step |
| Small/caption | no change | no change | no change |

**Spacing:**

| Property | Tablet | Mobile Landscape | Mobile Portrait |
|---|---|---|---|
| Section padding T/B | -1 space step (e.g. 96→64) | -2 steps (96→48) | -2 steps (96→48) |
| Section padding L/R | --space-lg (24) | --space-md (16) | --space-sm (16) |
| Container side padding | --space-md (16) | --space-sm (16) | --space-sm (16) |
| Element gaps | -1 step or no change | -1 step | -1 step |

**Components:**

| Property | Tablet | Mobile Landscape | Mobile Portrait |
|---|---|---|---|
| Buttons | auto width | width: 100% | width: 100% |
| Button min-height | 48px | 48px | 48px |
| Images | width: 100%, height: auto or fixed + object-fit: cover | same | same |
| Cards | maintain grid if 2-col, else stack | stack | stack |
| Hero image | may need height: auto on mobile | height: auto | height: auto |

## 4. Touch target enforcement (AUTO-FIX, not just flag)

**Minimum touch target sizes (WCAG 2.5.8 / iOS HIG):**
- Interactive elements: **44×44px minimum** (buttons, links, form inputs, nav items)
- Spacing between touch targets: **8px minimum** (prevents accidental taps)

**Auto-fix application:**
- After applying design overrides, scan all interactive elements at mobile breakpoints
- If any element has computed dimensions < 44px in either direction → **auto-apply padding to reach 44px minimum**
- If spacing between interactive elements < 8px → **auto-apply gap/margin to reach 8px minimum**
- Log all auto-fixes in the responsive report: "auto-enforced touch target on [element] from 36px to 44px"
- **Never skip touch target enforcement** — it's not optional polish, it's usability requirement

**Touch target fix priority:**
1. Button/link min-height: 48px (generous) or 44px (minimum)
2. Form input min-height: 44px
3. Nav link tap area: 44px (may need padding increase)
4. Spacing between adjacent targets: 8px minimum

## 5. Apply

Per class, per breakpoint: `data_style_tool > update_style` with `breakpoint_id` — override only the changed properties (cascade handles the rest). API mode can't set class styles → output exact Designer steps per breakpoint per class and log to pending ledger.

**Application order:**
1. Layout changes (grid columns, flex direction, display)
2. Typography changes (font-size, line-height)
3. Spacing changes (padding, margin, gap)
4. Component changes (button width, image sizing)
5. Touch target enforcement (last, so it doesn't interfere with design intent)

**Cascade awareness:**
- Desktop-first: base values set at Desktop, override only what changes below
- Large breakpoints (1280/1920): override only if design specifies — otherwise inherit from Desktop
- Never override a property at a breakpoint if the inherited value is correct

## 6. Verify every breakpoint

For each breakpoint, run these checks:

**Structural:**
- [ ] No horizontal overflow (body/html don't scroll horizontally)
- [ ] No text clipping or orphan wraps (single word on last line)
- [ ] Images not stretched or cropped wrong (aspect ratio preserved or object-fit correct)
- [ ] Spacing rhythm preserved (smaller, not broken)
- [ ] Nav usable (native navbar handles hamburger — never custom-build it)
- [ ] Absolutely-positioned elements don't bleed outside their container

**Visual:**
- [ ] Type hierarchy maintained (H1 still largest, body still readable)
- [ ] Color contrast still accessible (check if lighter colors on mobile background)
- [ ] Shadows/radii look correct at smaller scale
- [ ] Images still have enough resolution (not pixelated at display size)

**Interactive:**
- [ ] Tap targets ≥44px (auto-enforced in step 4)
- [ ] Hover-dependent content has tap equivalent (Webflow converts hover→tap; verify)
- [ ] Form inputs are tappable and keyboard-friendly
- [ ] Parallax/heavy motion disabled below tablet (performance)

**Automation:**
- Design-specified breakpoints get a property diff just like pixel-verify (compare applied values to design values)
- Derived breakpoints get this sanity checklist
- **No horizontal overflow check:** use `element_snapshot_tool` or ask user to confirm no horizontal scroll

## 7. Common failures → fixes

| Problem | Fix | Prevention |
|---|---|---|
| Nav links overflow tablet | rely on native navbar collapse setting | Set navbar breakpoint at tablet width |
| Hero image wrong height mobile | fixed height + object-fit: cover at that breakpoint | Set height: auto first, adjust if needed |
| Card/split image not responsive on mobile (collapses/overflows) | at stacked breakpoint set image `height: auto` + media `min-height: auto` | Never rely on `height: 100%` when the parent's mobile height is only `min-height` (not definite) — see §0 object-fit trap |
| Two-col too narrow tablet | stack to 1 col or reduce side padding | Check min-width before stacking |
| Gap too large mobile | gap override per breakpoint | Scale gap with spacing steps |
| Absolute element bleeds | position: relative at mobile | Check absolute elements during desktop build |
| Hover-dependent content on touch | ensure tap equivalent (Webflow converts hover→tap; verify) | Test hover→tap conversion |
| Parallax/heavy motion on mobile | disable below tablet | Check animation properties at mobile |
| Text too small to read | enforce minimum 14px body text at mobile | Check type scale at all breakpoints |
| Button too small to tap | padding increase to reach 44px min-height | Auto-enforce in step 4 |
| Image pixelated | use higher resolution asset or reduce display size | Check asset resolution at intake |
| Grid items overflow | reduce columns or add overflow: hidden | Verify grid at each breakpoint |
| Sticky header covers content | add padding-top to section below | Test sticky behavior with content |

## 8. Report

```
RESPONSIVE — [section]
breakpoints-detected: [list from get_all_breakpoints]
design-frames: [list from intake spec] | none (derived patterns applied)

tablet:       [overrides applied — from design | derived]
              ✓ no overflow | ✓ touch targets enforced | ✓ layout verified
              auto-fixes: [list or none]

mobile-l:     [same]
              ✓ no overflow | ✓ touch targets enforced | ✓ layout verified
              auto-fixes: [list or none]

mobile-p:     [same]
              ✓ no overflow | ✓ touch targets enforced | ✓ layout verified
              auto-fixes: [list or none]

large-desktop: [overrides applied — from design | inherited from desktop]
              ✓ verified (if design frame exists) | skipped (no design frame)

derived-values: [list all values that were derived, not designed — for user awareness]
designer-steps-pending: [none | ledger items]
touch-targets: [N elements auto-enforced to ≥44px]
```

**Report persistence:** append summary to `build_state.json` under `responsive_reports` for audit trail.
