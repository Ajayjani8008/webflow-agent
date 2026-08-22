---
name: webflow-svg-native-path
description: "Correct native Webflow SVG handling — Image element is the SVG module, bind by asset id, keep vector"
metadata:
  node_type: memory
  type: reference
  originSessionId: 3a2cd7e8-755a-43e4-8765-898f9c4b8d6e
---

Webflow has NO dedicated "SVG" element. The `Image` element IS the native SVG-capable module — renders `.svg` assets crisp/scalable. SVG → `Image` is correct, not a bug. Inline `<svg>` would need `HtmlEmbed`/`DOM` = banned by GOAT rules.

**The one correct flow (verified against live MCP schema 2026-07-13):**
1. `asset_tool upload_image_by_url` with source URL (accepts `.svg`, incl. Figma `figma.com/api/mcp/asset/...`). Returns asset `{id, url, mimeType}`.
2. `data_element_builder` type `Image` → `set_image_asset {image_asset_id, alt_text}`. Bind by **asset id**, NOT raw URL.

**Failures to avoid:**
- Raw `src` via `set_attributes` / CDN URL → Webflow skips it, `"does not exist in asset library"` (classic bug). Must be uploaded asset id.
- Rasterizing normal icons/logos to PNG kills vector crispness — only rasterize a complex multi-vector graphic that won't upload as one SVG.
- `compress_assets` on svg → 400 "never-compressible"; skip SVG in compression.
- SVG-as-`Image` can't recolor via CSS `color`/`fill` — upload correctly-colored SVG or rebuild glyph natively.

Encoded in build-reference SKILL.md ("SVG & image assets — correct native path"). See [[webflow-help-center-build]] (old whtml-era GOTCHA 1 predates this native path), [[webflow-mcp-gotchas]].
