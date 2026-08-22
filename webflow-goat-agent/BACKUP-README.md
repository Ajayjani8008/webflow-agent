# Webflow GOAT Agent — v2.1.14

Pixel-perfect, fully native Webflow builds from any reference — Figma · screenshot · HTML delivery · live URL · React/Vue/SPA · plain description — driven through the Webflow MCP. Zero custom code.

**DONE = visually indistinguishable from the reference at every breakpoint, every effect, every icon, every word — proved by tool output, not by claim.**

**New user? Read `how-to-use.md` first** — commands, rules and quick answers on one page. This file is the install/restore manual.

---

## Restore — what goes where

`~` = home: `%USERPROFILE%` on Windows, `/Users/<you>` on macOS, `/home/<you>` on Linux.

| Pack path | Restore to | What it is |
|---|---|---|
| `CLAUDE.md` | `~/CLAUDE.md` | **The router** — lane table, the six invariants, the cost model, the paths. Injected into EVERY session, so it stays small (≤6KB). Changed in v2.0: this file *is* the always-on layer now. Older packs said "do not restore as `~/CLAUDE.md`" — that guidance is dead. |
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` | Pointer only (≤4KB). It deliberately does **not** repeat the rules — in v1.11.0 it was a byte-identical copy of `CLAUDE.md` and cost ~10k tokens twice per session. `wf-lint` now fails on that duplication. |
| `skills/*` | `~/.claude/skills/` | **16 skills**, lazy-loaded per lane. `webflow-core` holds the full rule set and loads only on build lanes (T1/T2/T3). |
| `scripts/*` | `~/docs/memory/webflow/scripts/` | The verification + build pipeline — **25 required files**, plus `package.json`, `package-lock.json` and `pixel-diff.test.js`. |
| `settings-permissions.json` | **MERGE** into `~/.claude/settings.json` | The permission rules the gates need in order to run without an approval prompt per step. **Merge — never replace:** that file also holds your model, theme, plugins and env. See step 4 of "After restore"; skipping this is the single most common reason a restored pack underperforms. |
| `docs-memory/*` | `~/docs/memory/webflow/` | `error_learnings.md` · `impossible_cases.md` · `v2-rationale.md` · `sites/_template/` (seed for a new site) · `sites/<site-id>/` per-site state. |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | Cross-platform agent routing; the Webflow rows point here. |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | Cross-session knowledge: MCP gotchas, SVG native path, CMS collection-list limits, pixel-match method, source-isolation policy. |
| `how-to-use.md`, `CHANGELOG.md` | `~/docs/memory/webflow/` | Human-readable. Never loaded during a build. |

`~/.claude/rules/webflow/` is **not** part of this pack any more — it was pure changelog and never loaded. History lives in `CHANGELOG.md`.

---

## After restore — five steps, in order

**1. Install the dependencies.** In `~/docs/memory/webflow/scripts/`:

    npm install

Run it **in the scripts directory**, not at `~` (moved there in v2.1.2). `node_modules` is no longer committed to the repo — `package-lock.json` is the reproducible source, so a fresh clone needs this step. Deps: `pixelmatch`, `pngjs`, `ws`.

**2. Google Chrome.** Every screenshot, pixel score, a11y/perf audit and motion measurement drives headless Chrome. Auto-detected per platform — Windows `C:/Program Files/Google/Chrome/Application/chrome.exe`, macOS `/Applications/Google Chrome.app/...`, Linux `google-chrome` on PATH.

**3. OCR, only if you build from screenshots.** `shot-compile.js` reads strings out of a PNG. macOS uses the bundled `wf-ocr.swift` (Vision, compiled on demand, nothing to install). **Everywhere else install `tesseract`** — Windows: `winget install UB-Mannheim.TesseractOCR`, then put `C:\Program Files\Tesseract-OCR` on PATH. Without either, a screenshot source cannot compile and the build falls back to hand-authored strings — the exact condition that once produced a build carrying 1.4% of its reference. Figma / URL / HTML sources are unaffected.

**4. Merge the permissions.** See `settings-permissions.json`. Substitute `<SCRIPTS>` with your absolute scripts path. On Windows keep **both** slash directions — the Bash tool emits forward slashes, PowerShell emits backslashes, and a permission rule matches a **literal prefix**, so one direction alone still prompts for half the pipeline. An agent cannot write this file itself: the harness blocks permission self-expansion, correctly. Apply it by hand or via `/update-config`.

**5. Verify the install.**

    node <abs>/docs/memory/webflow/scripts/wf-doctor.js     # environment + state drift
    node <abs>/docs/memory/webflow/scripts/wf-lint.js       # pack integrity — must be 0 errors, 0 warnings

`wf-doctor` must report **25 pipeline scripts present**, deps resolvable **from the scripts dir**, and Chrome found. `wf-lint` byte-compares live against the repo, so it also catches a half-finished restore.

---

## Command shape — this is not a style preference

Invoke every pack script as **ONE command, absolute path, nothing before it**:

    node /abs/path/docs/memory/webflow/scripts/wf-doctor.js

These all MISS the permission rule and each miss costs an approval prompt:

    cd $WF/scripts && node wf-doctor.js      # compound — the rule sees `cd`
    WF=~/docs/...; node $WF/scripts/x.js     # variable — no literal prefix
    node ~/docs/memory/webflow/scripts/x.js  # tilde is not the literal path

Resolve the absolute path once per session (`wf-doctor` prints it) and reuse it verbatim.

---

## What the pack enforces (v2.1.14)

The accuracy engine is a chain, and every link is fail-closed. Loosening any one of them is how quality was lost once already — see the v2.1.14 entry in `CHANGELOG.md` for the full post-mortem.

**anchor view → PASS → score ≥99 + report → `verified`**

- **The anchor view gates the verdict.** `verify-section.js` prints `PASS-PENDING-ANCHOR` and **exits 1** when every score is clean but the side-by-side has not been looked at. Pass `--anchor-seen="<what the comparison showed>"` to reach `PASS`. Reason: **no script can see a render.** A section once scored 98.75% PASS, zero hot regions, `dom-contract` 158/158 — with an entire text line missing.
- **Pass floor is 99%**, plus height delta ≤2% and no 12×12 cell >25% mismatched.
- **Primary capture width = the reference frame's width**, never the 1440 default. A 1920-authored frame scored against a 1440 capture compares the design to a reflow it never described.
- **`wf-section record` refuses a closing status** (`verified`/`responsive`) without a score at or above the floor AND a report. A failing score records as `built` with what is still open.
- **Budget per section: ≤25 tool calls · ≤35 turns · ≤50k peak context**, derived from the pipeline (§ A steps 0-9 are ~22 calls with zero fix iterations). Publishes stay capped at 2; #3 needs a root cause not already recorded.
- **Two MCP tools stay denied** — `data_whtml_builder` and `data_scripts_tool`. That is Invariant 1 (native only) enforced by the harness rather than by the agent's restraint.

**Known traps**, all in `build-reference § Known traps`: `.w-button` ships Webflow blue + white text, so every variant class must set its own background AND color · gradient text is a `DOM span` with **unprefixed** `background-image` + `background-clip: text` + `color: transparent` (any `-webkit-*` makes `data_style_tool` reject the whole call) · absolute children of a container that STACKS need `position: static`, or they pile on with zero horizontal overflow so the overflow gate stays green · a `designer_tool` failure is usually an idle timeout on a backgrounded tab, not a failed build — **do not rebuild the section**.

---

## Three copies, and none of them is the source of truth

A working install exists in three places at once:

1. **live** — `~/.claude/skills/`, `~/CLAUDE.md`, `~/.claude/agents/webflow/`, `~/docs/memory/webflow/`
2. **the git clone** — whatever `env.WF_REPO` points at in `~/.claude/settings.json`
3. **any second clone** you extracted elsewhere

`wf-lint` byte-compares live against the repo, so drift is detectable — but only if you run it. Edit all copies or edit one and sync; a file changed in one place alone will be silently reverted by the next restore. Verified drift has happened: a clone once sat three patch versions behind on `how-to-use.md`.

Files are **LF**, enforced by `.gitattributes`, because `wf-lint`'s comparison is byte-for-byte. A CRLF checkout reports false drift on every file. Editing with a script? Python's `io.open(...,'w')` writes CRLF on Windows unless you pass `newline=''`.

---

## Per-site state

Everything a build remembers lives at `~/docs/memory/webflow/sites/<site-id>/`:

    registry.md              classes, components, variables, motion recipes
    build_state.json         sections, statuses, scores, measured cost
    pending_designer_work.md Designer-only items ([critical] blocks "complete")
    specs/<section>.md       the written intake spec — the build contract
    figma-cache/ ref-cache/  fetched sources, never re-fetched

`<site-id>` is **derived, never invented**: match `build_state.site.site_id` under `sites/`, else the site's shortName/slug from `data_sites_tool`, else seed from `sites/_template/`. `wf-resolve.js` does this and locks the target — a guessed folder name splits one site's state across two directories, neither complete.

Scores recorded before v1.9.0 are not valid evidence; re-score with `verify-section.js`. `wf-doctor` flags any closing status carrying no score, a zero score, or no measured cost.

---

## Requirements

Node.js (any current LTS) · Google Chrome · the Webflow MCP connected in Claude · a `FIGMA_TOKEN` in the environment if you build from Figma (the Figma MCP needs an editor seat; without one the pack falls back to the Figma REST API, and with neither it asks for a screenshot source instead) · `tesseract` for screenshot sources on non-macOS.
