---
name: webflow-help-center-build
description: "The Encircle Help Center Webflow page build — ids, hc-* class system, whtml build method and two gotchas"
metadata:
  node_type: memory
  type: project
  originSessionId: 2e467a6f-9f93-42a6-8986-1a870ea26a46
---

Built the Figma "Help Center" design into the Webflow **help-center** page (pixel-perfect, no header/footer per user).

- Site `Encircle's Fantabulous Site` siteId `6a4e1fd26e16d7ca79ffca31`; page `Help Center` pageId `6a4e7a4f2971b84972fb04c5` slug `/help-center` (NOTE: this pageId was labelled `about` in [[webflow-encircle-resources-build]] but is now Help Center; that memory is stale). Body element id `6a4e7a4f2971b84972fb04cf`.
- Figma file `a9S1S24B2siUtmSrNFNBZB`, root node `578:2700`. Figma MCP WORKS this session (get_design_context/get_metadata/get_screenshot) — no REST fallback needed. File has no published variables.
- 5 sections, all fresh `hc-*` BEM classes (rp-* system exists but is for the resources design; not reused): hero (dark), light articles intro+divider, 4 article cards (hc-split / hc-full / hc-split / hc-hexpanel), related events (3 hc-ev cards), get-in-touch CTA. Font: Inter (already installed).
- Build method that worked: `data_whtml_builder` one call per section, HTML + raw CSS, appended to Body. Produces native elements. Verified via publish → headless-Chrome screenshot → compare to Figma PNG.
- GOTCHA 1 — whtml `<img>` with a Webflow CDN SVG URL is SKIPPED ("does not exist in asset library"). Fix: render every icon/photo/graphic as CSS `background-image` on a `<span>`/`<div>` instead of `<img>`. Uploaded all 18 assets first via `asset_tool upload_image_by_url` (accepts the Figma `figma.com/api/mcp/asset/...` URL directly). Complex multi-vector graphic (hex diagram) → `get_screenshot` the node → upload the PNG as one asset.
- GOTCHA 2 — flex containers with `align-items:center`/`flex-start` let children shrink-to-fit their `max-width`; give hero/CTA/intro children `width:100%`. Responsive via `data_style_tool update_style` at breakpoints medium/small/tiny (stack grids to 1fr, shrink H1 96→46→38). Combo-class grid override: name-only `update_style` hits the combo node; that's what the element uses, so it works.
- GOTCHA 3 — headless `--window-size=390` does NOT set the layout viewport (renders at ~489 and clips the screenshot, looking like overflow when there is none). To truly verify mobile, drive Chrome via CDP `Emulation.setDeviceMetricsOverride {width:390,mobile:true}` + `Page.captureScreenshot`. Node CDP script in scratchpad (`shot.js`).
- Published live: https://encircles-fantabulous-site.webflow.io/help-center . Verified desktop 1440 + real-mobile 390. Follows [[webflow-pixel-match-method]].
