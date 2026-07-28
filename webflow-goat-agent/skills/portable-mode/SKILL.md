---
name: portable-mode
description: Turn cross-site portability on or off for the current build (/portable on|off). Portable = raw values baked into classes, no variables, self-contained paste — what marketplace templates do. Load when the user invokes /portable, says a section must work on another site, or asks for a cloneable/template/self-contained block.
---

# Portable Mode

**Why it exists:** a cross-site paste carries structure, text, image URLs and class styles (including `:hover`), but `var(--space-lg)` becomes a dangling pointer on the target site — the layout collapses. Portable = every value literal, nothing depending on the source project's database.

**Default is OFF** (variables on, central token control). This skill is the switch, not the default.

## Triggers

- Explicit: `/portable on` · `/portable off` · `/portable` (report current state).
- Intent phrases: "copy this to another site", "reuse on our other project", "portable", "self-contained", "cloneable", "template", "for multiple sites".
- Ambiguous ("might reuse this later") → ONE yes/no question, never an assumption.

State lives in `build_state.json` `portable: true|false` so it survives a session death, and every affected class is tagged in `registry.md ## Portable` with the date. Switching mid-build does NOT retro-fix classes already written — say so, and offer to rewrite the ones already built.

## Confirm line before the first portable class

> *"Portable mode ON: raw values, no variables — self-contained paste, central token control off for these classes. Proceed?"*

No yes → mode stays off.

## Deltas when ON (every other rule unchanged)

1. **No variables** — literal longhand values only. Never `var()`, never a variable created "just for this".
2. **Self-contained classes** — no reliance on a parent utility class that lives outside the copied subtree.
3. **Emit the font list** — fonts don't travel. Report exactly which families the target site must install first, or the block renders in fallbacks.
4. **Prefer class `:hover` + transition** for state motion (copies with the DOM). Native Interactions scoped to a **component** travel with that component; page-level interactions do not → exact build-script into `registry.md ## Interactions` plus the report.
5. **Flag the non-portable up front, before building:** Symbols/components → rebuild or Shared Library on the target · CMS bindings → static if single-use, else rebind on target · slider/tabs/navbar → dead shells until Designer re-init · class-name collisions on the target site (prefix if the target already owns `.card`).
6. **Portability report at the end** — two columns, no hedging:
   - **Travels:** structure, text, image URLs, class styles incl. `:hover`
   - **Manual on target:** fonts to install, module re-init, interactions to rebuild, CMS to rebind, class collisions to resolve

## Scope

Portable mode = ONE section/block into an existing other site. **A whole design that must be reusable → recommend a cloneable project instead** (everything clones: variables, interactions, CMS schema, symbols) and say why it beats portable classes.

Accuracy is not negotiable in portable mode: raw values must equal the resolved variable values exactly (same hex, same px) — pixel-verify runs unchanged, and a "close enough" literal is a failed section like any other.
