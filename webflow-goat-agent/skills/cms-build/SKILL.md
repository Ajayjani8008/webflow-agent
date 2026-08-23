---
name: cms-build
description: Build a native Webflow CMS Collection List end to end via MCP — collection + fields, item creation (incl. image upload), the DynamoWrapper/List/Item element tree, field bindings by setting key, conditional visibility, then verification. Load when a pattern repeats ≥3× as editorial content, when the user asks for a blog/resources/team/FAQ list, or when items must be editor-updatable. Carries the verified hard limits.
---

# CMS Build — native Collection List, zero custom code

Proven flow (partner-program `hc-articles`, 2026-07-12). **Decide first:** ≥3 same-structure repeats + editor-updated + per-item image/detail page → CMS. ≥2 repeats that are *not* editorial → `component-build` instead. One-off → static div-block. Getting this wrong costs a rebuild, so record the decision in the spec `elements:` row.

## 0. Derive the collection FROM THE REFERENCE, before creating anything

`node "$WF/scripts/wf-cms.js" plan <extract.json> --prefix=<block> [--min-repeat=3] [--out=<file>]`

Returns the decision and, when it is CMS, the whole schema: how many items the reference carries, which
slots VARY per item (those are fields, typed PlainText / RichText / Number / DateTime / Image / Link),
which slots are identical in every item (those are **static chrome and must never become fields**), the
per-element binding map with its exact setting key, the item payloads, and the image-upload count.

Two guards it enforces, both from real failures:
- **Ranked by content, never by repeat count.** A decorative grid out-repeats every editorial list — a
  144-cell pixel mask beat a 5-row content list on a live reference and produced a zero-field plan that
  still read READY. Groups whose items carry no text/src/href are rejected as scenery, and listed.
- **Zero varying slots = not a collection.** Identical repeats are a component (`component-build`) or
  decoration. The script returns NO-CMS with the reason instead of creating an empty collection.

Capture the block itself (`.the-list-wrapper`), not the whole page: a page-wide extract hits the 800-node
cap and decorative cells crowd the real rows out of the capture entirely.

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

## 4b. PROVE THE DATA RENDERS — the gate no pixel score can replace

`node "$WF/scripts/wf-cms.js" verify <publishedUrl> "<selector>" [--expect-items=N]`

Webflow marks its own data failures in the DOM, and nothing in this pack read them until v2.1.18:

| Signal | Means | Usual cause |
|---|---|---|
| `.w-dyn-empty` visible | no items reached the list | items never published (drafts render empty live) · a filter excludes everything · `source` written as a plain string instead of `static_json {"collectionId":"…"}` |
| `.w-dyn-bind-empty` | Webflow bound the element and got **nothing back** | the field is empty on those items · bound to the wrong field id · Image field bound to `assetId` while the item stores a URL |
| item count ≠ expected | list is truncating | "Limit items" setting · draft/archived items · a list filter |
| bound `<img>` with no `src` | asset never resolved | empty Image field · the S3 upload never completed |
| `.w-condition-invisible` | a condition hid it | a Switch field is false/empty — fine when intended, confirm it is |

**A CMS section is not done until this passes.** An empty bound heading is blank pixels: the section can
score 99% with every item missing. Never "fix" a `.w-dyn-bind-empty` by hiding the element.

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
