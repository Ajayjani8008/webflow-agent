# Webflow GOAT — How To Use (v1.8.0)

One agent, everything inline. You give a design source + target page, it builds pixel-perfect native Webflow. This doc = the whole manual.

## How big a job gets how much process (v1.8.0)

The agent picks a lane before it loads anything, so small asks stay small:

| You say | Lane | What it does |
|---|---|---|
| "make the CTA blue", "16px gap", "fix this typo" | T0 | changes it, reads back proof, one shot of that element. No intake, no scoring sweep |
| "build this hero from Figma/HTML" | T1 | full pipeline: intake → native build → pixel-verify → responsive |
| "build the whole page" | T2 | T1 per section, section 1 verified first, one publish for the batch |
| "the hero broke on mobile", "the animation doesn't fire" | T3 | evidence first (reads the real state before theorising), fixes at that layer only |
| "audit my classes", "set up the CMS schema" | T4 | read-back + report, no pixel scoring (nothing visual changed) |

Small task feeling slow or over-processed? Say "T0" or "just change it" and it stays in the fast lane.

## Start a build (pick your source — say it naturally)

| You have | Say | What happens |
|---|---|---|
| Figma file | "Build [page] from this Figma: <url>" | One-time `/figma-setup` caches whole file → builds section by section from cache |
| Live website | "Build home page like this site: <url>" | Exact computed CSS extracted + reference screenshots → same accuracy as Figma |
| Screenshot | Paste image + "build this" | Vision analysis with confidence levels → confirms unknowns with you first |
| HTML/CSS code | Paste it (or point at the folder) + "build this" | Whole delivery read (every css/js), reference RUN headless, then rebuilt 100% native — layout AND hover/scroll/load behaviour, code never enters the site |
| Just an idea | Describe it | Agent drafts spec → you confirm → build |

Open the Webflow Designer on the target page first — agent builds where you're looking.

## Commands (only these — everything else is automatic)

| Command | What it does | When |
|---|---|---|
| `/figma-setup <url>` | Caches entire Figma file locally (one time) | Start of a Figma project |
| `/portable on` · `/portable off` | Raw values instead of variables → section survives copy-paste to another site | Before building a section you'll reuse cross-site |
| `/custom-code-once` | ONE-time exception to the custom-code ban — one snippet, logged, ban restores | Only when you hard-require custom JS/CSS |
| `/webflow-help` | Shows this cheat sheet | Anytime — costs nothing to a build |

Skills like design-intake, pixel-verify, responsive-pass run automatically — you never call them.

## What the agent does per section (automatic, don't ask for it)

Read exact values → build native elements + classes → verify against source (screenshot + DOM diff) → all breakpoints → log → next section. Section 1 is verified before section 2 starts.

## The 6 rules that affect YOU

1. **It never guesses.** Missing value that matters → it asks you once. Answer = faster build.
2. **Zero custom code, and never the agent's decision.** Sliders/tabs/forms = native elements. Only a canvas/WebGL effect is even eligible for code, and the agent must show why T1/T2/T3 can't do it and then ASK you — no answer means it ships the native fallback. Anything else: `/custom-code-once` is the only door and only you can open it.
3. **"Done" = proven.** Every section screenshot-verified vs the design. Don't skip-approve mid-verification.
4. **Some things are Designer-only** (IX2 animations, slider init, Symbols). They land in `pending_designer_work.md` — check that list; the agent will tell you it's "partial", never falsely "working".
5. **One source at a time.** Figma build won't touch URL tools and vice versa — that's intentional (token/speed).
6. **Crash-safe.** New session after a crash → say "resume" — it continues from the last verified section.

## Quick answers

- **Wrong page got built?** You were on a different page/branch in Designer — agent builds where you are. Open the right page, say "rebuild here".
- **Section invisible?** Likely page/branch mismatch or IX2 opacity — agent stops and tells you which.
- **Want it on another site later?** Say so BEFORE building → portable mode.
- **Figma changed after caching?** Say "re-run figma-setup" — cache is a snapshot.
- **Animations?** Describe the motion or give a reference site. Hover/transitions build now; scroll/load animations = Designer work (pending list).

## Files it keeps (in `~/docs/memory/webflow/`, per site since v1.9.0)

Per site, under `sites/<site-id>/`: `registry.md` classes/variables/pages · `build_state.json` resume point · `pending_designer_work.md` **your manual to-do for that site only** (a different site's leftovers can no longer block this one) · `figma-cache/` + `ref-cache/` fetched sources.
Shared at the root: `impossible_cases.md` what Webflow can't do natively · `error_learnings.md` dated lessons · `scripts/` the verification tools.

**Checks it runs on every section (v1.9.0):** pixel score ≥97% **and** height within 2% **and** no single region >25% wrong · accessibility + performance (contrast, keyboard, headings, alt, image weight, layout shift, 44px touch targets) · behaviour parity for hover/scroll/load. Every number in its report is pasted straight from the tool, so you can check it yourself — a score without that block means it wasn't measured.

**Health check any time:** `node ~/docs/memory/webflow/scripts/wf-lint.js` (are the agent's own rules pointing at real files?) · `bash ~/docs/memory/webflow/scripts/wf-sync.sh` (is the git copy up to date?).
