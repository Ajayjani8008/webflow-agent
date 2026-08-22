---
name: webflow-encircle-resources-build
description: The Encircle Resources/About page Webflow build — site/page/figma ids and the existing rp-* class system
metadata:
  node_type: memory
  type: project
  originSessionId: 2d5aa1d5-db02-486b-b069-634c03dcdc49
---

Building the Figma "Resources page design" into the Webflow **about** page.

- Webflow site: `Encircle's Fantabulous Site` siteId `6a4e1fd26e16d7ca79ffca31`; page `about` pageId `6a4e7a4f2971b84972fb04c5`; branch main (null).
- Figma file `FVatC876Wk0xYjvnTsv0Bn`, root node `1:506` (an html.to.design import). Figma MCP is blocked (account `crea8ivedev@gmail.com` lacks editor seat) → use REST API with token in `~/.claude/.figma_token`.
- 8 sections to build (Nav + Footer skipped per user): HERO `1:4`, FOLD2 FEATURED `1:90`, FOLD3 VIDEOS `1:115`, FOLD4 CASE STUDIES `1:198`, FOLD5 DATASHEETS `1:259`, FOLD6 COMPARISONS `1:340`, FOLD7 ROI `1:397`, FOLD8 CTA `1:71`.
- A complete, Figma-accurate `rp-*` BEM class system already exists on the site from a prior build (page had gone blank, classes stayed). REUSE it — build the DOM on `rp-hero*`, `rp-fc--1..6`, `rp-btn--solid/outline`, `rp-chip`, `rp-feat*`, `rp-vcard*`, `rp-cs*`, `rp-ds*`, `rp-cmp*`, `rp-roi*`, `rp-cta*`. Don't recreate.
- Done: ALL 8 desktop sections built + verified via headless-Chrome screenshot of published page — matches Figma. Text leaves use DOM `div` (NOT TextBlock — that bug wasted a full rebuild; see [[webflow-pixel-match-method]]). Added classes: `rp-feat__dot`, `rp-ds__line`; fixed `rp-hero__grad` (clipped gradient text) and `rp-btn--outline` (background:transparent, was inheriting Webflow blue).
- Verify loop that works: publish to webflow subdomain → `chrome --headless=new --screenshot` at 1920 wide (Windows output path) → Read the PNG. Published URL: https://encircles-fantabulous-site.webflow.io/about
- STILL TODO: responsive breakpoints (tablet/mobile), hover states, skipped decorative SVGs (hero network graph, video-thumb gradients), minor label-color polish (`rp-cmp__vs` is grey vs Figma purple). Follows [[webflow-pixel-match-method]].
- Designer bridge app times out when idle → relaunch link app param `dc8209c65e3ec02254d15275ca056539c89f6d15741893a0adf29ad6f381eb99`.
