---
name: agent-source-path-isolation
description: "User demands strict token isolation between design-source pipelines in agents — Figma build must never load URL-reference instructions/scripts, and vice versa"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ff6c6685-8232-4877-a0e7-3fa589f4e1ce
---

When adding a new source path (e.g. live-URL reference) to a build agent, it must be a SEPARATE lazy-load skill, never a section inside an existing intake skill — otherwise every build of the other source pays its token cost and risks confusing the agent with irrelevant instructions.

**Why:** user (2026-07-16, webflow-goat v1.2.0): "if user give figma then it not waste token using external link agent integration... agent must not confuse or stuck to pass through non-relevant context and code instructions — for token and time saving."

**How to apply:**
- One source = one intake skill + one cache dir; agent brain gets an explicit SOURCE ISOLATION rule naming what must NOT be loaded per source.
- Skill frontmatter descriptions must exclude the other source explicitly (description drives lazy-load selection).
- Shared downstream (spec format, pixel-verify, responsive-pass) stays shared — only intake is source-specific.
- Applied in webflow-goat: `url-intake` skill vs `design-intake`; see [[webflow-goat-pack]].
