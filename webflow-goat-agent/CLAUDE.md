# Webflow GOAT — v2.1.14 (router)

Pixel-perfect, fully native Webflow builds from any reference (Figma / screenshot / HTML / live URL / description).
**DONE = visually indistinguishable from the reference at every breakpoint, every effect, every icon, every word — proved by tool output, not by claim.**

This file is a router. It is injected into every session, so it stays small. The operating rules live in the
`webflow-core` skill and load only on the lanes that build.

## Route first — one line, then work

| Lane | Trigger | First action |
|---|---|---|
| **T0 micro-edit** | ≤3 properties on ≤2 existing elements, values the USER dictated | no skill — edit, fresh read-back, `shot-el.js` if a layout property moved |
| **T1 section** | build/rebuild one section from a reference | `Skill(webflow-core)` **before any MCP write** |
| **T2 page** | several sections / whole page | `Skill(webflow-core)` — then ONE section per session |
| **T3 debug** | something built is wrong | `Skill(webflow-core)` — evidence before theory |
| **T4 inspect** | audit, CMS schema, SEO, publish, handoff | no skill unless a tool errors → `Skill(webflow-platform)` |
| **question** | "can Webflow do X", explain, help | answer directly; grep `$WF/error_learnings.md` only if it is a known trap |

A build lane that writes to Webflow before loading `webflow-core` is a process failure. T0/T4/question never load it.

## Invariants — true in every lane, no exceptions

1. **Native only.** No html/css/js without a written `T1→T2→T3` descent proof AND an explicit per-effect user yes. Never propose code, never self-invoke `/custom-code-once`.
2. **Exact values from the source.** Never guess a value that exists. Design gaps the brief left open are yours to decide at studio quality — that is not guessing.
3. **Real content only.** Zero placeholder, zero lorem, zero invented copy.
4. **Evidence, never claim.** A gate passes only on a fresh post-write read-back or a tool's verbatim `EVIDENCE` block. A number in prose is not a pass.
5. **Longhand CSS via `data_style_tool` on a class.** Shorthands land in Custom Properties and are void. `xattr` is HTML semantics only.
6. **Snapshot before destroying anything you did not just create.** There is no undo API.

## Cost model — the thing that actually costs

Cost = **turns × context size**, not payload size. An image is ~1.5k tokens; a silent reasoning turn at 400k context is 400k.
Per section: **≤25 tool calls, ≤35 turns, ≤50k peak context.** Passing either → say so in one line and keep going.
The call number is derived from the pipeline, not chosen: `webflow-core` § A steps 0-9 are ~22 calls with **zero** fix iterations, and one fix→re-verify cycle is +2. A budget below its own mandated pipeline does not restrain the agent — it teaches it to pick a gate to skip, which is exactly how a 1.4% build passed every gate that ran.
Never trade a gate for tokens — batch calls instead. Looking at the reference render is cheap and mandatory.

## Where things are

```
WF="$HOME/docs/memory/webflow"          # resolve once per session
$WF/scripts/                            # verification + build pipeline (npm install here)
$WF/sites/<site-id>/                    # registry.md · build_state.json · pending_designer_work.md
$WF/sites/<site-id>/specs/<section>.md  # the written intake spec — the build contract
$WF/error_learnings.md  $WF/impossible_cases.md  $WF/CHANGELOG.md
```
`<site-id>` is **derived, never invented**: match `build_state.site.site_id` under `$WF/sites/`, else the site's
shortName/slug from `data_sites_tool`, then seed from `sites/_template/`. Run `node "$WF/scripts/wf-resolve.js"` — it does this and locks the target.

## Skills

`webflow-core` (the rules — build lanes) · `design-intake` · `html-intake` · `url-intake` · `figma-setup` ·
`build-reference` · `webflow-platform` · `component-build` · `cms-build` · `motion-build` · `pixel-verify` ·
`responsive-pass` · `portable-mode` · `session-recovery` · `custom-code-once` (user-invoked only) · `webflow-help`.

Load per lane, never by habit. One source → one intake skill, never two.
