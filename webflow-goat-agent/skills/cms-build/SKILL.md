---
name: cms-build
description: Build a native Webflow CMS Collection List end to end via MCP — collection + fields, item creation (incl. image upload), the DynamoWrapper/List/Item element tree, field bindings by setting key, conditional visibility, then verification. Load when a pattern repeats ≥3× as editorial content, when the user asks for a blog/resources/team/FAQ list, or when items must be editor-updatable. Carries the verified hard limits.
---

# CMS Build — native Collection List, zero custom code

Proven flow (partner-program `hc-articles`, 2026-07-12). **Decide first:** ≥3 same-structure repeats + editor-updated + per-item image/detail page → CMS. ≥2 repeats that are *not* editorial → `component-build` instead. One-off → static div-block. Getting this wrong costs a rebuild, so record the decision in the spec `elements:` row.

## 1. Collection + fields

1. `data_cms_tool > create_collection` → then `create_collection_static_field` per field (`create_collection_option_field` for enums, `create_collection_reference_field` for relations). Image field accepts `{url, alt}` at item-create — Webflow re-hosts it. Switch = boolean.
2. Creating a collection auto-creates a `detail_*` template page — expect it, don't create one.
3. Field slugs are the binding contract: name them for content (`article-title`, `card-image`), never for layout.
4. `name`/`slug` fields already exist — POSTing them again = 422 and the whole call aborts.

## 2. Items (data first, canvas second)

- Text/number/switch/option → `create_collection_items` with `fieldData`.
- **Images:** `data_assets_tool > create_asset` (file_name + MD5 `file_hash`) → POST the bytes to the returned S3 `uploadUrl` as multipart, every `uploadDetails` property as a form field in order (`acl, bucket, X-Amz-*, key, Policy, X-Amz-Signature, success_action_status, Content-Type, Cache-Control, file`) → 201 → use the returned hosted URL in the item's `fieldData.image`. (`asset_tool > upload_image_by_url` is the shortcut when the image already lives at a public URL.)
- Content comes from the source verbatim — the content gate (`pixel-verify §1.5`) applies to CMS items exactly like static text. No lorem, no invented rows.
- Publish items (`publish_collection_items`) when the page is published; drafts render empty on the live site.

## 3. The element tree

1. `data_element_builder type: "CMSCollection"` → creates `DynamoWrapper > DynamoList > DynamoItem` (+ `DynamoEmpty`). Never hand-build a div list.
2. Bind the collection on the **DynamoWrapper**: `set_settings` key `source`, **`static_json` `{"collectionId":"<id>"}`** — plain string / `static_text` is rejected (the error states the shape).
3. Build the card template INSIDE the `DynamoItem` (append) using the native module map — one template, styled once.
4. Layout/gap goes on the **DynamoList** class (it is the flex/grid parent), not the wrapper.
5. Empty state: style `DynamoEmpty` with real copy — never leave the default string.

## 4. Bindings (discover keys, never guess)

`get_settings type:"query_settings"` on the element → available keys. `get_bindable_sources` → field ids + what each setting accepts. Then `set_settings` with `binding: {source_type:"cms", collection_id, field_id}`:

| Content | Element | Setting key |
|---|---|---|
| Heading / paragraph text | Heading, Paragraph | `text` (valueType `textContent`) |
| Image | Image | `assetId` (+ `altText` for alt) |
| Link / CTA href | LinkBlock, TextLink, Button | `link` |
| Conditional show/hide | any | `visibility` ← bind to a Switch field |
| Detail-page link | LinkBlock | `link` → collection page |

Static labels inside the item (an eyebrow, a "Read more") → `set_settings` key `text` + `static_text.value`. Bound text always wins over static.

## 5. Hard limits (verified — design around them, don't fight them)

- **Color field is NOT bindable to any style property** (`bindableTo: []`). Per-item accent colours are impossible natively → one fixed colour, or an Option field + hand-styled states in the Designer (ledger item). Log to `impossible_cases.md` when the design demanded it.
- **One template per Collection List** — layout cannot vary per item. Unify into one card, or add Switch fields + bound `visibility` to show/hide sub-blocks. Two genuinely different layouts = two lists with filters.
- **Items created via the Data API do NOT appear on an already-open Designer canvas** ("No items found"): the canvas store is stale, and a page switch re-renders without refetching. Only a full Designer reload (Cmd/Ctrl+R) or a publish shows them. **Verify data with `list_collection_items`, never with a canvas snapshot** — a snapshot showing the empty state is not a bug to chase.
- `TextBlock` + inline `set_text` renders the default placeholder (set_text ignored) — use Heading/Paragraph, or fix afterwards via `set_settings` key `text`. (`webflow-platform § Element builder text gotcha`.)
- Sorting/filtering beyond the panel's own options is Designer work → ledger, never JS.

## 6. Verify

- [ ] `list_collection_items` → count + field values match the source (data truth, not canvas)
- [ ] Element tree is Dynamo* natives, wrapper bound to the right `collectionId`
- [ ] Every intended field bound (read back `get_settings type:"all_resolved_settings"` on one item's elements) — an unbound field renders the template's static value on every card, which looks like "all items identical"
- [ ] Images resolve to real assets + real alt per item (`pixel-verify §1.6`)
- [ ] Empty state has real copy; conditional visibility toggles as intended
- [ ] Published page shows N items (not the empty state) — this is the only reliable visual check
- [ ] Registry `## CMS` entry: collection name + id, fields (slug → type), which page/section consumes it, limits hit
- [ ] `build_state.json` `cms` block carries all ids for resume

Cross-site copy: CMS bindings do NOT travel (collection ids differ) → portable mode flags the list as static-or-rebind (`webflow-platform § Portability traps`).
