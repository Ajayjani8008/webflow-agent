# Webflow GOAT Agent — Backup v1.1.2

**Created:** 2026-07-16 (Mac) · **Cross-platform:** Windows / macOS / Linux — zero platform-specific paths anywhere in this pack.

Pixel-perfect, native-only Webflow build agent (Figma / screenshot / HTML / **live-site URL** → Webflow via MCP). Zero custom code.

**New user? Read `how-to-use.md` first** — commands, rules, quick answers on one page.

## What's inside → where it lives (`~` = home dir: `%USERPROFILE%` on Windows, `/Users/<you>` on Mac, `/home/<you>` on Linux)

| Backup path | Restore to | What it is |
|---|---|---|
| `CLAUDE.md` | `~/CLAUDE.md` (standalone mode) | Agent brain: rules, workflow, source routing, portable mode, source isolation, "never" list |
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` (Claude Code agent mode) | Same brain wrapped as a Claude Code agent — use ONE of the two modes, not both |
| `skills/*` | `~/.claude/skills/` | 9 lazy skills: build-reference, design-intake, figma-setup, pixel-verify, responsive-pass, session-recovery, **url-intake (new)**, **custom-code-once (new)**, **webflow-help (new)** |
| `how-to-use.md` | anywhere user-readable (also `~/docs/memory/webflow/`) | Human manual — never loaded by the agent during builds |
| `docs-memory/*` | `~/docs/memory/webflow/` | registry.md (fresh single-file template), pending_designer_work.md, impossible_cases.md, error_learnings.md (incl. merged v5 lessons), scripts: shot.js / shot-el.js / **ref-extract.js (new)** |
| `rules/webflow-core.md` | `~/.claude/rules/webflow/core.md` | 8-line GOAT router (replaces retired 85-line v5 orchestrator) |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | Platform routing — Webflow rows point to webflow-goat |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | Cross-session knowledge: MCP gotchas, SVG native path, CMS collection-list limits, pixel-match method, source-isolation policy, Encircle build notes |

After restore: `npm i ws --no-save` at `~` (screenshot/extract scripts need it) + Google Chrome installed (scripts auto-detect: Windows `Program Files` path / Mac `Applications` path / Linux `google-chrome` on PATH).

## v1.1.2 changes (since v1.1.1)

1. **NEW SOURCE: live website URL as design reference** — skill `url-intake` + script `ref-extract.js` (headless-Chrome CDP walker: exact computed CSS per element, text, img srcs, bounding boxes, site's CSS variables; non-default values only; 800-node cap with per-section fallback). Figma-grade accuracy, zero vision guessing. Reference screenshots via shot-el.js per breakpoint; responsive values EXTRACTED at 991/767/478, never derived. All fetch-once in `docs/memory/webflow/ref-cache/{domain}/`. Third-party site → layout/patterns only, never their brand assets/copy.
2. **SOURCE ISOLATION (token/time):** one source = one intake skill + one cache. Figma builds never load url-intake/ref-cache; URL builds never load figma-setup/figma-cache/Figma MCP. Enforced in agent brain (Skills section + Phases 1–2) and skill descriptions.
3. **v5 system fully retired:** old 85-line orchestrator rules → 8-line router (~2K tokens saved every session); `webflow-kb/` removed (durable lessons merged into `error_learnings.md`); stale v3/v5 project state archived; single `registry.md` restored as the one registry format.
4. **`/custom-code-once` escape hatch:** custom code stays hard-banned; the ONLY exception is the user explicitly invoking this skill — native-answer-first, one confirmed snippet (scoped selector, no external scripts, IIFE-wrapped JS), logged in registry `## Custom-Code-Exceptions` + pending ledger, ban restores immediately. Agent may never suggest it. pixel-verify sweep whitelists only logged entries.
5. **User docs:** `how-to-use.md` manual + `/webflow-help` skill (cheat sheet on demand) — pure documentation, loads only when the user asks for help; zero token cost to builds.
6. **Cross-platform scripts:** shot.js / shot-el.js / ref-extract.js auto-detect OS (Chrome path, temp dir, ws resolution from home dir). No `C:\` paths anywhere in the pack.

## Known limits (native / MCP) — unchanged
- No IX2/interaction API in MCP → all motion is manual Designer work.
- Gradient-clipped text not settable via API → solid fallback + Designer finish.
- CSS rotation not native.
- ref-extract cannot see JS-driven hover/scroll animations or exact font files → Animation intake path / ask user.
See `docs-memory/impossible_cases.md` and `auto-memory/webflow-mcp-gotchas.md`.

## Restore
Copy each backup path to its "Restore to" location (table above), pick agent mode OR standalone CLAUDE.md mode, then `npm i ws --no-save` at `~`. Nothing else — no build step, no OS-specific config.
