# Project Registry — one line per item, grep the section you need

**Scope:** one registry per SITE (`sites/<site-id>/registry.md`). Never mix sites — a class that exists on another site is not reuse, it is a name collision waiting to happen.

## VALIDATION RULES (apply before creating any item)

**Before creating a class:**
1. Grep `## Classes` for the exact name → exists → reuse it, do not redefine.
2. Grep for a class with the same role (`__title`, `__card`, `--dark`) → same styles → reuse; different by ≤1 property → combo class, not a new base.
3. New name must be BEM kebab-case (`block`, `block__element`, `block__element--modifier`) and must not duplicate an existing one with different casing.
4. Append the line the moment the class is created — never at the end of a section build.

**Before creating a variable:** grep `## Variables` → color within ±15/channel or spacing/type within ±10% of an existing step → reuse it; otherwise create with the EXACT value and log why (`build-reference § Standard variable set`).

**Before building a repeated block:** grep `## Components` (≥2× → component with props) and `## CMS` (≥3× editorial → Collection List). A second copy of a subtree that already exists here is a build bug.

**Before writing any code:** grep `## Custom-Code-Exceptions`. No entry with a descent proof AND the user's verbatim authorization = no code (agent Rule 4, pixel-verify §1).

**Before analysing an animation:** grep `## Motion-Recipes` — a solved animation is a zero-analysis build. Panel vocabulary comes from `## Motion-Panel`, never invented.

---

## Classes
<!-- `.class-name` | role | key props | breakpoints overridden | page/section | date -->

## Variables
<!-- --var-name | value | family (color/space/font-size/radius/duration/easing) | why new (if near an existing step) | date -->

## Pages
<!-- page name | slug | page_id | sections built | status | date -->

## Components
<!-- component name | component_id | props (name:type) | variants | instances | pages | date -->

## Interactions
<!-- name | trigger | target class/component | tier (CSS/panel/Lottie) | duration/easing/stagger | applied? (verified date) | pages -->

## CMS
<!-- collection | collection_id | fields (slug:type) | bound elements | list settings (sort/limit/filter) | pages | date -->

## Impossible-Cases
<!-- pointer only — full entries live in ../../impossible_cases.md: feature | section | date -->

## Custom-Code-Exceptions
<!-- [date] page/section | css|js|canvas | what it does | descent proof: T1 why-not · T2 why-not · T3 why-not | user authorization VERBATIM | authorized via: /custom-code-once | T4-ask -->

## Motion-Recipes
<!-- name | tier | IR line | exact build payload (class props / panel build-script / Lottie asset) | verified on [date] -->

## Motion-Panel
<!-- flavour: Interactions-with-GSAP | Classic — learned from user screenshot on [date]; exact control labels observed: … -->

## Motion-Applied
<!-- interaction name | page | applied in Designer on [date] | motion-verify proof (moved/duration/jank) -->

## Portable
<!-- class or section | portable ON since [date] | raw values baked (no var()) | fonts the target site must install | non-portable flags -->
