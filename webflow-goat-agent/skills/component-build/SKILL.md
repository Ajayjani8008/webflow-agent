---
name: component-build
description: Build reusable Webflow components via MCP — decide when to componentize, create the component, define props for the varying text/image/link/number/boolean, add variants for state differences, use slots for injected children, set per-instance prop values, and verify. Load when a pattern repeats ≥2× (cards, feature rows, testimonials, nav, footer, pricing tiers) or when a repeated block needs one edit point. Replaces copying subtrees.
---

# Component Build — repeated block = ONE component with props

Since Webflow MCP 2.0.1 (server version — not the `2026-07-28` protocol spec) components, props, variants and slots are fully API-buildable (`webflow-platform § MCP surface`) — this is no longer Designer work. Copying a subtree N times is now the slow, drift-prone path: N× element calls, N× style risk, N× fix passes, and the user edits N places.

**Trigger (from intake `elements:`):** same structure appears ≥2× and is not editorial CMS content (≥3 editorial repeats → CMS Collection List instead, `cms-build`). Also componentize a single block when it will be reused across pages, or when motion must travel with it (component-scoped Interactions copy across pages/sites — `motion-build § platform facts`).

## 1. Decide the shape BEFORE building (one pass, written into the spec)

```
component: card-feature
  props:   title(textContent) · body(textContent) · icon(image) · link(link) · badge(string, optional)
  variants: base · highlighted (bg + border override)
  slots:   none            # only when the parent must inject arbitrary children
  instances: 6 (values from source, verbatim)
```

Rules that decide prop-vs-variant-vs-slot:
- **Prop** = the same element with different content or a different link/number/boolean. Text, image, alt, href, ids, counts.
- **Variant** = the same content with different *styles* (highlighted tier, dark card, active tab). Variant styles are overrides; anything unset falls back to base.
- **Slot** = the parent supplies whole child elements you can't enumerate (a card that may hold any block). Only component instances may go inside a slot — never regular elements.
- Neither fits and the difference is structural (extra row, different element order) → separate component, not a variant.

Props cover: `textContent`, `string`, `richText`, `image`, `link`, `video`, `number`, `boolean`, `id`, `altText`. A visual difference that isn't one of those is a variant.

## 2. Build order (fewest calls, styles first)

1. **Styles first.** Create every class the component needs in the section's single `data_style_tool` batch (agent § Batching) — element creation can then reference them.
2. **Build one instance natively** as normal elements (native module map applies inside components exactly as outside — `build-reference § Node types`).
3. **`data_component_tool > transform_element_to_component {element_id, name}`** — turns the built block into a component and swaps it for an instance. (`create_blank_component` only when authoring from nothing.) Name it after the pattern, not the page: `card-feature`, not `home-card-3`.
4. **Define props in ONE call:** `data_component_props_tool > create_prop {component_id, props: [...]}` — each prop carries its type group + default (`default_text` / `default_number` / `default_boolean` / `default_link` / `default_video`). Defaults should be the *first instance's real values*, never placeholder strings (content gate still applies).
5. **Bind props to element settings inside the definition:** `data_element_settings_tool > get_bindable_sources {element_id, setting_key, scope_component_id}` → `set_settings` with `{binding: {source_type:"prop", prop_id}}`, same `scope_component_id`. No canvas navigation needed. Bind the setting that matters: `textContent` for copy, `assetId`+`altText` for images, link fields for CTAs, `domId` only when a script/anchor needs it.
6. **Variants:** `create_variant` (or `duplicate_variant` from `base`) → `set_variant_styles {variant_id, style_name, properties[], breakpoint_id, pseudo}`. Set ONLY the overriding properties. Variant style writes never touch base.
7. **Instances:** `data_component_builder > insert_in_element` (or `insert_component_instance`) per placement, then `data_component_props_tool > set_component_instance_prop_values {element_id, values[]}` — one call per instance, all values in it. Slots get instances via `insert_in_slot` with `slot_name`.
8. **Editing the definition later:** every element action takes `scope_component_id` — never unlink an instance to "fix one card" (`unlink_component_instance` is a last resort and breaks the single edit point).

Batching target: **one style batch · one element batch for the source block · one prop-create call · one insert+values call per instance.** Six cards should cost ~4 calls, not 6 subtree builds.

## 3. Verify (same evidence bar as any section)

- [ ] `get_component {component_id, options:{includeProps:true, includeVariants:true, includeInstanceCount:true}}` → prop list, variant list, instance count == spec
- [ ] Each instance's values read back verbatim from the source (`get_component_instance_props` with `resolved_value`) — content gate `pixel-verify §1.5` applies per instance, no defaults leaking through as visible copy
- [ ] Every image prop resolves to an uploaded asset id + real alt (`pixel-verify §1.6`)
- [ ] Variant overrides applied at the right `breakpoint_id`/`pseudo`, base untouched (read both)
- [ ] `element_snapshot_tool` on two different instances — they differ exactly where props/variants say they should and nowhere else
- [ ] Rendered instance count matches the reference (a component that dropped an item is still an omission)
- [ ] Registry: `## Components` entry — name, props (name+type), variants, where instanced, date

## 4. Traps (verified behaviour)

- **Name is global.** Style names are site-level; two components using `.card__title` share that class. Intentional reuse = fine, accidental = cross-component drift. Check `get_styles` before inventing a name.
- **Props are not styles.** Never add a prop to swap a colour — that is a variant.
- **Prop type is immutable:** wrong type → `remove_prop` + `create_prop`, so decide types in step 1.
- **Slots reject plain elements** — insert a component instance or restructure.
- **`unregister_component` is destructive** (removes every instance site-wide) — confirm with the user first, never as cleanup.
- **Interactions scope to the component** and then travel with it; page-level interactions on an instance do not. Motion that belongs to the pattern → scope it to the component and say so in the report (`motion-build § Phase 3`).
- **Portable mode:** components carry their class styles but are site-specific objects — cross-site paste needs the component rebuilt or shared via Library; flag it (`webflow-platform § Portability traps`).
