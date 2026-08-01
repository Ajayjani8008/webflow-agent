# Agent Orchestration (all platforms)

## Platform detection → routing
| Signal | Platform | Rules |
|--------|----------|-------|
| Webflow site/MCP (`mcp__claude_ai_Webflow__*`) or Webflow mentioned | Webflow | `webflow-goat` agent — ALL Webflow work end-to-end inline (intake → build → pixel-verify → responsive). No orchestrator, no webflow-builder, no classifier. |
| Divi/Respira/WordPress + Divi | Divi | `rules/divi/*` → divi-orchestrator |

## Intent shortcuts (auto-route, no asking)
Figma URL → platform's design pipeline. Screenshot of a design → screenshot pipeline. `bug::`/`issue::` → systematic-debugger (Divi) / webflow-goat handles its own debugging (Webflow). Site name mentioned → find + activate site (MCP sites tool or REST). (Webflow: everything via webflow-goat — routing lives in `~/CLAUDE.md`, rules in the `webflow-core` skill.)

## Universal principles
- Complexity-scaled workflow: small tasks execute immediately, no agents, no planning. Full pipelines only for large work.
- Claude native first: planning, analysis, review, architecture decisions, SEO meta — done inline, never delegated to meta-agents.
- Native-first build ladder (platform elements before custom code; embeds last resort with justification).
- Evidence rule: "complete" requires site read-back proof, never agent self-claims.
- Permissions: auto-proceed on additive staged work; ask only for delete/replace/overwrite, production publish, external integrations, security-sensitive ops.
- MCP mode preferred when connector tools present; otherwise REST API with env credentials.
