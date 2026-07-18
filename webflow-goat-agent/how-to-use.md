# Webflow GOAT — How To Use (v1.2.0)

One agent, everything inline. You give a design source + target page, it builds pixel-perfect native Webflow. This doc = the whole manual.

## Start a build (pick your source — say it naturally)

| You have | Say | What happens |
|---|---|---|
| Figma file | "Build [page] from this Figma: <url>" | One-time `/figma-setup` caches whole file → builds section by section from cache |
| Live website | "Build home page like this site: <url>" | Exact computed CSS extracted + reference screenshots → same accuracy as Figma |
| Screenshot | Paste image + "build this" | Vision analysis with confidence levels → confirms unknowns with you first |
| HTML/CSS code | Paste it + "build this" | Values read as ground truth → rebuilt 100% native (code never enters site) |
| Just an idea | Describe it | Agent drafts spec → you confirm → build |

Open the Webflow Designer on the target page first — agent builds where you're looking.

## Commands (only these — everything else is automatic)

| Command | What it does | When |
|---|---|---|
| `/figma-setup <url>` | Caches Figma file locally (one time). Scoped by default: only the sections you're building; say "fetch everything" for the whole file | Start of a Figma project |
| `/portable on` · `/portable off` | Raw values instead of variables → section survives copy-paste to another site | Before building a section you'll reuse cross-site |
| `/custom-code-once` | ONE-time exception to the custom-code ban — one snippet, logged, ban restores | Only when you hard-require custom JS/CSS |
| `/webflow-help` | Shows this cheat sheet | Anytime — costs nothing to a build |

Skills like design-intake, pixel-verify, responsive-pass run automatically — you never call them.

## What the agent does per section (automatic, don't ask for it)

Read exact values → build native elements + classes → verify against source (screenshot + DOM diff) → all breakpoints → log → next section. Section 1 is verified before section 2 starts.

## The 6 rules that affect YOU

1. **It never guesses.** Missing value that matters → it asks you once. Answer = faster build.
2. **Zero custom code.** Sliders/tabs/forms = native elements. Hard-need JS/CSS → `/custom-code-once` is the only door.
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

## Files it keeps (in `docs/memory/webflow/`)

`registry.md` classes/variables/pages · `build_state.json` resume point · `pending_designer_work.md` your manual to-do · `impossible_cases.md` what Webflow can't do natively.
