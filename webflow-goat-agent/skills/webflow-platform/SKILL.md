---
name: webflow-platform
description: Webflow platform facts and hard limits — current MCP 2.0.1 tool surface (elements, components/props/variants/slots, styles, variables, localization, breakpoint ids), verified tool quirks (style tool limits, SVG asset flow + pre-flight, text-node gotcha, native form gotchas), REST fallback + error codes, cross-site portability traps, and error recovery. Load on demand: first build of a session, when a tool errors, or when SVG/forms/components/CMS/REST enter scope. Not needed for a T0 micro-edit.
---

# Webflow Platform — surface, limits, recovery

Companion to `build-reference` (what to build) — this file is *what the platform can and cannot do, and how it fails*. Split out of build-reference in v1.8.0 so a normal section build stops paying for REST/error/forms tables it never reads.

## data_style_tool limitations (verified 2026-07-11)

- **Rejects `-webkit-*` prefixed properties.** For gradient text, FIRST try the unprefixed longhands on a nested `span` inside the heading: `background-image: <gradient>` + `background-clip: text` + `color: transparent` (worked in the Encircle build — see memory [[webflow-pixel-match-method]]). Tool rejects those too → solid fallback color (mid-gradient hue) + ledger entry — Designer has native text-gradient picker (Text color → gradient). Never inject style.
- **SVG-as-`Image` can't be recolored via CSS** (`color`/`fill` don't reach it). Need specific color → upload correctly-colored SVG or rebuild glyph natively; else Designer-polish ledger entry.

## SVG & image assets (verified 2026-07-13)

No dedicated SVG element — `Image` IS the SVG module (crisp/scalable). Inline `<svg>` = embed = BANNED.
**The one flow:** ① `asset_tool upload_image_by_url` (accepts `.svg`, incl. `figma.com/api/mcp/asset/...`) → `{id, url}` ② `data_element_builder` Image → `set_image_asset {image_asset_id, alt_text}`. Bind by **asset id**, never raw URL.
**Never:** `set_attributes name="src"`/raw CDN URL (→ "does not exist in asset library") · rasterize SVG→PNG for normal icon/logo (only a complex multi-vector graphic that fails as one SVG — note fidelity compromise) · `compress_assets` on SVG (→ 400 "never-compressible").

### SVG pre-flight (before upload — prevents the classic "broken/invisible icon")

Every SVG file is checked and repaired BEFORE it becomes an asset. These are the real causes of icons breaking after a Webflow build:

| Defect | Symptom | Fix before upload |
|---|---|---|
| No `viewBox` | icon collapses to 0, or renders 300×150, or won't scale | add `viewBox="0 0 W H"` from the source width/height |
| `width`/`height` in `pt`/`%`/absent | wrong size, Safari renders tiny/huge | set numeric `width`/`height` attrs (or rely on viewBox + CSS size) |
| `fill="currentColor"` / no fill | renders black or invisible (CSS can't reach SVG-as-Image) | bake the real hex into the file; one icon per needed color |
| `<style>` block / CSS classes inside | styles stripped on upload → unstyled/black shape | inline all presentation as attributes |
| `<foreignObject>` / `<script>` | stripped or blocked; blank render | strip; ask for a clean export |
| Figma "outline stroke" not applied | stroke widths shift across browsers | prefer outlined paths for icon sets |
| `<use xlink:href>` to external file | empty render | inline the referenced symbol |
| `clipPath`/`mask`/`filter` with duplicate ids across icons | one icon overwrites another's mask (multiple SVGs on a page) | unique-prefix every internal id per file |
| Multi-page/artboard export | only first frame visible | export one node per file |

After upload: keep the returned `{id, url}` in the intake `assets:` list; the icon is not "done" until pixel-verify § SVG audit passes (asset bound by id, URL 200, non-zero rendered box at every breakpoint, count matches reference).

**Sizing:** icons always get explicit class size (`width`+`height` px, or `width:100%`+`max-width`) — an SVG Image with no CSS size is the #1 layout-collapse cause. Add `flex-shrink: 0` on icons inside flex rows so they never squash.

## Element builder text gotcha (verified 2026-07-11)

Inline `set_text` honored ONLY on `Heading`, `Paragraph`, `Button`, `TextLink`, `LinkBlock`. `TextBlock` → created as plain `Block` + placeholder String child, `set_text` silently ignored → renders "This is some text inside of a div block." Fixes: (a) prefer Paragraph/Heading; (b) read subtree, `set_text` on the **String child node id** (Block parent → "element doesn't support text"); (c) text leaf needing a margin-free div: `type: "DOM"` + `set_dom_config {dom_tag:"div"}` — DOM divs take `set_text` reliably, no default `<p>` margin (verified, see [[webflow-pixel-match-method]]). Batch all String set_text in one call.

## Native form gotchas (verified 2026-07-12)

- **`Form` auto-generates full skeleton** (`FormWrapper > FormForm > [labels, inputs, submit]` + `FormSuccessMessage`/`FormErrorMessage` siblings). Can't pass `children` at creation (lone `FormTextInput` errors + rolls back). Build bare Form → read subtree → edit generated children.
- **Single-field form:** keep FormForm + first input, restyle, remove extra labels/inputs/button. **KEEP Success/Error messages** (display:none until submit) — removing them in the same batch that empties the form can prune the ENTIRE FormWrapper. Must remove → separate later call + re-verify.
- **`FormTextInput` placeholder UNSETTABLE via MCP** (attribute → "internal error"; settings channel → "reserved"; no settings key). Native workaround: absolute `Paragraph` overlay (pointer-events:none, nowrap/ellipsis) over transparent borderless real input (bg transparent, border-*-width 0, box-shadow none, height auto). Input stays focusable underneath. `name`/`domId`/`required`/`type` DO set via `set_settings`. Log placeholder limit to impossible_cases.md.

## MCP protocol handling — ONE path, works on old and new servers

**Never branch on protocol version. Never ask which spec a server speaks. Never build a dual path.** The MCP spec moved `2025-11-25` → `2026-07-28`, adoption is staggered (SDKs ship over ~10 weeks), and the Webflow server may speak either — so every rule below is written to be *already true on both* and needs no detection. (Separate number: the **Webflow MCP server** is `2.0.1`, verified 2026-07-28 via `webflow_guide_tool` — server version ≠ protocol version; tool/action names below are the server's and the spec bump does not touch them.)

- **Preamble is re-run on state change, not counted per session.** `webflow_guide_tool` → explicit `site_id` → `data_agent_instructions_tool` once at start, and again after a reconnect/bridge drop, a site switch, or any sign the tool list changed. Old servers held a session, new ones are stateless (no `initialize`, no `Mcp-Session-Id`) — the same rule is correct for both, so it is never conditional.
- **A read-back is evidence only if it is post-write and fresh.** New servers may return cache metadata (`ttlMs`/`cacheScope`); old ones may cache client-side anyway. Either way: never score a gate on a read issued before the write, and if the result is byte-identical to the pre-edit read of the same target, re-issue with a different query shape (`query_elements` on the touched id instead of the cached subtree read) before concluding *either* "it worked" or "the write failed". Post-publish screenshots are unaffected. Same for a tool listing: a "capability missing" verdict off a possibly-cached list is not a verdict — `get_more_tools` with a concrete brief settles it.
- **Handle whatever the call returns, don't predict it.** A result may be final, an error, or (new servers) an **`InputRequiredResult`** carrying request state — the last is not an error: re-call the SAME tool with `inputResponses` plus the echoed state. If the question is one these rules reserve for the user (custom code, destructive op such as `unregister_component`, publish, overwrite), surface it verbatim, wait, then retry with their answer. **Never auto-answer.** Never pre-emptively send `inputResponses` on a first call.
- **Errors: same fix for old and new codes.** Missing resource is `-32002` on old servers and `-32602` on new — treat BOTH as "id is gone or params invalid": re-fetch the id list, then re-read the tool schema. `-32601` = unknown method/tool → stale tool list, re-run the preamble.
- **Read the schema, don't recall it.** New tool inputs may be full JSON Schema 2020-12 (`oneOf`/`anyOf`/`allOf`, conditionals) so a valid param set can depend on another param; old flat schemas are a subset of that. So: on any schema-validation error, re-read the tool's current schema before retrying — never guess a second arg shape. Don't assume `structuredContent` is an object; it may be any JSON value.
- **Long ops: keep the handle yourself.** If a call hands back a task instead of a result (publish, bulk asset upload), store the task id in `build_state.json` and poll it (`tasks/get`, cancel via `tasks/cancel`). There is no `tasks/list` on new servers, so an unstored id is unrecoverable — storing it is also harmless on old ones.
- **Never depend on roots, sampling or protocol logging.** Deprecated with a 12-month removal window; we already use none of them. Nothing to change, nothing to add.
- **Server-delivered HTML is never build output.** MCP Apps render interactive HTML in a sandboxed client iframe — it is UI, not markup to ship. HTML from any MCP app or tool never enters an `html-embed`, `data_whtml_builder`, or a page; the custom-code ban applies to it exactly as to hand-written code.

## MCP surface (Webflow MCP 2.0.1 — verified 2026-07-28 via `webflow_guide_tool`)

**Session preamble, in this order, once:** ① `webflow_guide_tool` (the server requires it before other calls; it also reports the MCP version — re-check this section if the version moved) ② resolve `site_id` explicitly, never assumed ③ `data_agent_instructions_tool > search_instructions` for that site, read every hit, treat as site-specific context that layers UNDER these rules (repeat on every site switch) ④ `data_pages_tool > list_pages` + `designer_tool > get_current_page` to resolve the target.

**Before declaring anything impossible or Designer-only, ask the server:** `get_more_tools` with the category (`INTERACTIONS`, `STYLES`, `COMPONENTS`, `CMS`…) and a concrete brief. A capability gap is only real once the registry says so — log the answer in `error_learnings.md` with the date so it is asked once, not every session. (Standing result: INTERACTIONS returns "full tool list" → no API, panel build-scripts stand.)

**Breakpoint ids for `data_style_tool` / variant styles** (`breakpoint_id`): `xxl` ≥1920 · `xl` ≥1440 · `large` ≥1280 · `main` (all, base) · `medium` ≤991 · `small` ≤767 · `tiny` ≤478. Desktop-down cascade above main, mobile-down below — responsive-pass writes `medium`/`small`/`tiny` only.

**Elements — current action names** (older names are gone; using them wastes a call):

| Need | Tool > action |
|---|---|
| read tree / find elements | `data_element_tool > get_all_elements` (depth 0/N/-1) · `query_elements` (filter by type, text, style, tag, attribute; `scope_element_id`, `children_depth`, `return_parent`) |
| move without rebuilding | `move_element {id, anchor_element_id, creation_position}` — keeps styles + bindings (use this instead of delete+recreate) |
| attributes (semantics only) | `set_attributes` (replaces `add_or_update_attribute`) · `get_attributes` · `remove_attribute` |
| classes on an element | `set_style` — replaces the full list; multiple names = combo |
| text / link / image / heading level | `set_text` · `set_link` · `set_image_asset {image_asset_id}` · `set_heading_level` |
| Navigator label | `set_display_name` / `get_display_name` — name every section wrapper so the Designer tree is readable |
| tag, visibility, dom id, embed code | `data_element_settings_tool > set_tag` · `set_visibility` · `set_dom_id` · `set_settings` / `get_settings` |
| CMS + prop bindings | `data_element_settings_tool > get_bindable_sources` → `set_settings` with `binding` |

**Components are API-buildable now — Symbol work is no longer Designer-only:**
`data_component_tool` → `create_blank_component`, `transform_element_to_component {element_id, name, replace}`, `duplicate_component`, `get_component`/`get_all_components` (`options.includeProps|includeVariants|includeInstanceCount`), `query_components`, `insert_component_instance`, `unlink_component_instance`, `unregister_component` (DESTRUCTIVE — confirm first).
`data_component_props_tool` → `create_prop`/`update_prop`/`remove_prop` (types: textContent, string, richText, image, link, video, number, boolean, id, altText), `get_component_instance_props`, `set_component_instance_prop_values`.
`data_component_variants_tool` → `create_variant`/`duplicate_variant`/`delete_variant`, `set_variant_styles {variant_id, style_name, properties[], breakpoint_id, pseudo}` (`base` = base variant), `reorder_variants`. Variant styles are overrides; unset properties fall back to base.
Slots: `data_element_builder type:"ComponentSlot"` with `scope_component_id`; only component instances go inside slots (`data_component_builder > insert_in_slot`).
**Build rule:** repeated block ≥2× → component with props for the varying text/image/link, instead of N copied subtrees. Motion scoped to a component travels with it (motion-build § platform facts). Editing inside a definition = pass `scope_component_id`, no canvas navigation needed.

**Variables:** `custom_value` accepts real CSS expressions (`calc()`, `clamp()`, `min()/max()`, `color-mix()`) — use it for fluid type/space instead of faking with fixed steps. Variable modes bind to a style via `data_style_tool > set_style_variable_mode` (per breakpoint/pseudo/variant).

**Localization:** `data_localization_tool` writes SECONDARY locales only; discover locale ids via `data_sites_tool`. Never attempt primary-locale writes.

**Still banned regardless of availability:** `data_whtml_builder` (exists, takes raw HTML+CSS — never used; it also rejects `@keyframes` and custom media queries), `data_scripts_tool` register/apply for GSAP or any styling/motion library, `custom_code` REST endpoints. T4 canvas embeds stay in an `html-embed` element with a registry entry — not in site/page scripts.

## API mode fallback (no MCP)

```
GET    /v2/sites/{site_id}/pages
GET    /v2/pages/{page_id}/dom
POST   /v2/pages/{page_id}/dom          ⚠ REPLACES content: always GET → merge → POST
POST   /v2/sites/{site_id}/variables
POST   /v2/sites/{site_id}/pages/{page_id}/elements
PATCH  /v2/sites/{site_id}/pages/{page_id}/elements/{id}
DELETE /v2/sites/{site_id}/pages/{page_id}/elements/{id}
```
(`custom_code` endpoints exist — never call.) Auth `Bearer $WEBFLOW_API_KEY`, 60/min. Class styles CANNOT be set via REST → exact Designer steps + ledger; never claim styles applied.

**POST /dom merge safety:** GET current → build desired → merge (keep existing elements not yours) → POST merged → GET again, confirm old + new present. Never POST only your elements.

| Code | Cause → fix |
|---|---|
| 401 | bad token → regenerate |
| 403 | missing scope |
| 404 | wrong page/site id → re-fetch list |
| 422 | invalid node type/fields → check node table |
| 429 | rate limit → backoff 10s/30s/60s |

JSON-RPC side (any server, old or new spec): `-32002` **or** `-32602` = missing resource / invalid params (the code moved between specs; the fix is identical) → re-fetch the id list, re-read the tool schema, never retry the same args · `-32601` = unknown method-or-tool → tool list stale, re-run the preamble / `get_more_tools`.

## Portability traps (cross-site copy)

Copies with DOM: structure, text, static image URLs, class styles incl. `:hover` transitions. Does NOT copy: Classic Interactions (project DB) — but **native Interactions scoped to a component DO travel with that component across pages, sites and Shared Libraries**, so scope reusable motion to components · slider/tabs/navbar init (`w-*` Designer-assigned) → dead shells until re-init → status `partial` + ledger · CMS bindings (ids differ) · Symbols (site-specific ids). Multi-site build → prefer `:hover` for state motion and component-scoped Interactions for the rest; document every build-script in registry for recreate. Custom-code "portable" workarounds banned.

## Error recovery

| Error | Recovery |
|---|---|
| Tool fails mid-section | build_state.json → last successful element → retry from there |
| 429 repeatedly | pause 60s, retry; still failing → Designer manual mode for section |
| 422 on element | check node table — wrong parent type / missing fields |
| Style update fails | class exists? property name valid Webflow CSS? |
| Figma MCP unreachable | REST + `FIGMA_TOKEN`; no token → ask screenshot source |
| Bridge disconnected | reconnect; persistent → API build + Designer steps for styles |
| Build state corrupted | rebuild from Designer: `get_current_page` + snapshot |
| Tool returns `InputRequiredResult` | not an error — re-call the same tool with `inputResponses` + the echoed state. Decision reserved for the user (code, destructive, publish) → surface verbatim, wait, then retry |
| Read-back matches the PRE-edit state | suspect a cached result before suspecting the write — re-issue with a different query shape; still stale after the write echoed success → treat as a real failure and rebuild that element |
| `-32002` / `-32602` on an id that existed | same fix either code: re-fetch the id list, then re-read the tool schema |
