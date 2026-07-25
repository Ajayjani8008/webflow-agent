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

1. Never guesses — asks once when a value matters. 2. Native ladder, not "no effects": hover/filters = class styles · `::before`/`::after`/shapes = real child elements · `@keyframes`/scroll/load = IX2 spec you apply in Designer · canvas/JS-driven = contained embed, logged. Nothing gets simplified or dropped; other custom code still needs `/custom-code-once`. 3. Every section proven vs design before "done" — pixel-score ≥97% at desktop AND at each breakpoint that has a mobile/tablet frame. 4. Real content only — no lorem, no placeholder copy, no substituted images. 5. IX2/slider-init/Symbols = Designer-only → `pending_designer_work.md`, status "partial". 6. One source per build (Figma tools never mix with URL tools). 7. Crash → new session → say "resume".

## Animation

Give a reference in any form — describe it, paste a video/GIF, link a site, paste GSAP or CSS code, or point at a Figma prototype. The agent reads it, writes a one-line spec per animation, then routes each one:

- **Hover/focus/active** → class styles + transition. Agent-built instantly, nothing for you to do.
- **Scroll reveals, scroll-scrub/parallax, pinning, page-load, click toggles, split-text, staggers** → your **native Interactions panel** (it's GSAP-powered — timeline, ScrollTrigger, SplitText and staggers are built in, no code). No API exists for it, so the agent hands you an exact build-script: numbered steps, every field value filled, all of a page's animations in one batch, ~60s each in the Designer.
- **Vector/illustration motion** → native Lottie element, agent-built.
- **Canvas/WebGL only** → contained embed, kept as the real thing.

The agent never injects GSAP or writes tween code — the engine already ships in Webflow, and injected motion would be invisible and uneditable in your panel.

First time it writes a build-script it asks for **one screenshot of your open Interactions panel** so it uses your exact control labels instead of guessing, then caches them forever. Scope motion to a component and it travels with that component across pages, sites and Shared Libraries.

Then it MEASURES the result (`motion-verify.js`): did it actually move, is the timing right, is anything janky, does it respect reduced-motion. Unmeasured animation never counts as done. The recipe library means the second time you want "cards fade up staggered", it costs no analysis.

**Give the agent a mobile frame.** If the Figma file has tablet/mobile frames it hunts for them and matches them exactly; with desktop only, mobile values are derived and it tells you which ones.

## Quick fixes

- Built on wrong page → open right page in Designer, say "rebuild here"
- Section invisible → page/branch mismatch or IX2 opacity; agent names which
- Reusing on another site → say BEFORE building (portable mode)
- Figma edited after cache → "re-run figma-setup"
- Animations → describe motion; hover builds now, scroll/load = Designer list
