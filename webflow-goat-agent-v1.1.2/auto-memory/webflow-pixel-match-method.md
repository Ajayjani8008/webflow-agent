---
name: webflow-pixel-match-method
description: "How the user wants Figma→Webflow builds done — see the render before building, verify pixel match after, native only"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2d5aa1d5-db02-486b-b069-634c03dcdc49
---

User's quality bar for Figma→Webflow: a section is done only when the Webflow render is **visually indistinguishable from the Figma PNG** at every breakpoint — not "values match", it must LOOK the same side by side. Work only through Webflow MCP + Figma (MCP or REST). Native only, never custom code.

**Why:** Building from Figma node JSON values alone produced mismatches. Concrete case: hero H1 "Hive Pro." is a per-character gradient (`#c084fc→#e879f9→#a78bfa`) stored in Figma `styleOverrideTable`; flat value-extraction reported it as solid white and the build missed the gradient. JSON also hides/flattens backdrop-blur, layered shadows, opacity, overlap, true wrap points — worst on `html.to.design` imports.

**Builder bug (critical):** In `data_element_builder`, `type: "TextBlock"` creates a plain DivBlock that does NOT accept text — build-time `set_text` is silently ignored and later `set_text` fails with "This element doesn't support text". Whole page rendered Webflow's "This is some text inside of a div block." placeholder everywhere. For text leaves use `type: "Paragraph"` or `type: "DOM"` with `set_dom_config {dom_tag:"div"}` (DOM divs take set_text reliably and have no default `<p>` margin). Heading/Paragraph/Button set_text works. ALWAYS screenshot the published page with headless Chrome (`chrome --headless --screenshot`, Windows output path) and view it — this is the only thing that caught it.

**How to apply:** (1) Before building a section, export its node PNG (`api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png`) and LOOK at it — render is ground truth, JSON is only measurements. (2) After building, put Figma PNG next to the result, list every diff, fix natively, loop until match; user confirms in Designer. (3) Gradient text is native: `background-image` gradient + `background-clip:text` + `-webkit-text-fill-color:transparent` + `color:transparent`, as a nested `span` inside the heading. See [[webflow-encircle-resources-build]].
