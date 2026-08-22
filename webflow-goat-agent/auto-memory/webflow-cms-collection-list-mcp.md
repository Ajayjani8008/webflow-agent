---
name: webflow-cms-collection-list-mcp
description: How to build a native dynamic CMS Collection List via Webflow MCP (element builder + bindings) and its hard limits
metadata:
  node_type: memory
  type: reference
  originSessionId: c0b6224d-58c9-4023-8b76-60b82c56e731
---

Building a native dynamic Collection List through the Webflow MCP (no custom code). Proven on partner-program `hc-articles` (2026-07-12).

**Flow that works:**
1. `data_cms_tool create_collection` → then `create_collection_static_field` for each field. Image field accepts `{url, alt}` on item create (Webflow re-hosts it). Switch = boolean field. Creating a collection auto-makes a `detail_*` template page.
2. Item images: upload photo first (`create_asset` with md5 file_hash → POST bytes to the returned S3 `uploadUrl` as multipart, field order: acl,bucket,X-Amz-*,key,Policy,X-Amz-Signature,success_action_status,Content-Type,Cache-Control,file → 201), then pass its hostedUrl in item `fieldData.image`.
3. `data_element_builder type:"CMSCollection"` → creates a `DynamoWrapper > DynamoList > DynamoItem` (+ DynamoEmpty).
4. Bind the collection: `set_settings` on the DynamoWrapper, key `source`, **`static_json` `{"collectionId":"<id>"}`** (plain string / static_text is rejected — error tells you the shape).
5. Build the card template INSIDE the DynamoItem (append). Style the DynamoList for gap/layout.
6. Bind fields with `set_settings` + `binding:{source_type:"cms",collection_id,field_id}`:
   - text content → key **`text`** (valueType textContent). Heading/Paragraph work directly.
   - image → key **`assetId`**; image alt → key `altText`.
   - link href → key **`link`**; visibility → key `visibility` (bind to a Switch field for conditional show/hide).
   - Discover keys with `get_settings type:"query_settings"`; discover field ids + what each element can bind to with `get_bindable_sources`.

**Hard limits / gotchas:**
- CMS **Color field is NOT bindable to any style property** (`bindableTo:[]`). Can't do per-item text/background accent colors dynamically. Use one fixed color, or Option field + hand-styled states in Designer.
- A Collection List repeats **ONE** template — can't vary layout per item natively. Unify into one card, or use Switch fields + bound visibility to show/hide sub-blocks.
- `data_element_builder` `TextBlock` with `set_text` → renders a div with DEFAULT placeholder text (set_text ignored). Fix static labels afterward with `set_settings` key `text` + `static_text.value` (that DOES apply). Bound text overrides it anyway. See [[webflow-mcp-gotchas]].
- **Items created via Data API do NOT appear on an already-open Designer canvas** ("No items found" empty state) — the canvas store is stale. A page-switch re-renders but does NOT refetch the dataset. Only a full Designer reload (Ctrl/Cmd+R) or publish shows them. Verify data via `list_collection_items`, not the canvas snapshot.
- Snapshot tool renders headings in a serif before Inter loads — font artifact only, ignore. See [[webflow-mcp-gotchas]].

Follows [[webflow-pixel-match-method]]; state in docs/memory/build_state.json (`cms` block has all ids).
