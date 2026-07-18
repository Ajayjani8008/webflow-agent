---
name: webflow-help
description: User cheat sheet for the Webflow GOAT agent — commands, rules, quick answers. Load ONLY when the user asks for help ("/webflow-help", "how do I use the webflow agent", "what commands"). NEVER load during a build; it is documentation, not build instructions.
---

# Webflow GOAT — Help

Show the user this cheat sheet (formatted, short). Do NOT start any build action from this skill. If a full manual exists at `docs/memory/webflow/how-to-use.md` or the pack's `how-to-use.md`, mention it.

## Start a build — just say it

- **Figma:** "Build [page] from this Figma: <url>" (first time auto-runs /figma-setup cache)
- **Live site:** "Build home page like this site: <url>" — exact CSS extracted, Figma-grade
- **Screenshot:** paste image + "build this" — unknowns confirmed with you first
- **HTML/CSS:** paste + "build this" — rebuilt native, your code never enters the site
- **Idea:** describe it → spec → your OK → build

Open the Designer on the target page first — it builds where you're looking.

## Commands

| Command | Does | When |
|---|---|---|
| `/figma-setup <url>` | One-time Figma cache | Figma project start |
| `/portable on/off` | Raw values, no variables → survives cross-site paste | Before a reusable section |
| `/custom-code-once` | ONE snippet exception to the code ban, logged, ban restores | Only when you hard-require custom JS/CSS |
| `/webflow-help` | This sheet | Anytime, free |

Everything else (intake, verify, responsive, resume) = automatic.

## Rules that affect you

1. Never guesses — asks once when a value matters. 2. Zero custom code (door: /custom-code-once). 3. Every section proven vs design before "done". 4. IX2/slider-init/Symbols = Designer-only → lands in `pending_designer_work.md`, status "partial". 5. One source per build (Figma tools never mix with URL tools). 6. Crash → new session → say "resume".

## Quick fixes

- Built on wrong page → open right page in Designer, say "rebuild here"
- Section invisible → page/branch mismatch or IX2 opacity; agent names which
- Reusing on another site → say BEFORE building (portable mode)
- Figma edited after cache → "re-run figma-setup"
- Animations → describe motion; hover builds now, scroll/load = Designer list
