# Webflow GOAT — How To Use (v2.1.14)

One agent, everything inline. You give a design source + target page, it builds pixel-perfect native Webflow. This doc = the whole manual.

## How big a job gets how much process

The agent picks a lane before it loads anything, so small asks stay small:

| You say | Lane | What it does |
|---|---|---|
| "make the CTA blue", "16px gap", "fix this typo" | T0 | changes it, reads back proof, one shot of that element. No intake, no scoring sweep |
| "build this hero from Figma/HTML" | T1 | full pipeline: intake → native build → pixel-verify → responsive |
| "build the whole page" | T2 | **one section per session.** It finishes a section, records it, and hands off — start the next in a fresh session and it resumes from `build_state.json`. That is deliberate: a long session costs more per turn than a fresh one |
| "the hero broke on mobile", "the animation doesn't fire" | T3 | evidence first (reads the real state before theorising), fixes at that layer only |
| "audit my classes", "set up the CMS schema" | T4 | read-back + report, no pixel scoring (nothing visual changed) |

Small task feeling slow or over-processed? Say "T0" or "just change it" and it stays in the fast lane.

## Start a build (pick your source — say it naturally)

| You have | Say | What happens |
|---|---|---|
| Figma file | "Build [page] from this Figma: `<url>`" | One-time `/figma-setup` caches the file → builds section by section from cache |
| Live website | "Build home page like this site: `<url>`" | Exact computed CSS extracted + reference screenshots → same accuracy as Figma |
| React/Vue/SPA/Storybook | Give the localhost or deployed URL | Treated as a live URL; waits for hydration. Generated class names never leak into your site |
| Screenshot | Paste image + "build this" | **Compiled, not eyeballed:** OCR reads every string with its position, pixels give colours, spacing and filled buttons. Two honest limits it prints every time — font *family* can't be known from an image (it names the substitute) and font *size* is a ±1px estimate, so it cross-checks against the render before building. Needs `tesseract` off macOS |
| HTML/CSS code | Paste it (or point at the folder) + "build this" | Whole delivery read (every css/js), reference RUN headless, then rebuilt 100% native — layout AND hover/scroll/load behaviour, code never enters the site |
| Just an idea | Describe it | Agent drafts a spec, states its assumptions in one line, and builds |

Open the Webflow Designer on the target page first — the agent builds where you're looking.

## Commands (only these — everything else is automatic)

| Command | What it does | When |
|---|---|---|
| `/figma-setup <url>` | Caches the Figma file locally (one time) | Start of a Figma project |
| `/portable on` · `/portable off` | Raw values instead of variables → section survives copy-paste to another site | Before building a section you'll reuse cross-site |
| `/custom-code-once` | ONE-time exception to the custom-code ban — one snippet, logged, ban restores | Only when you hard-require custom JS/CSS |
| `/webflow-help` | Shows this cheat sheet | Anytime — costs nothing to a build |

Skills like design-intake, pixel-verify and responsive-pass run automatically — you never call them.

## What the agent does per section (automatic, don't ask for it)

Read exact values → build native elements + classes → publish once → verify against the source (every breakpoint scored, DOM diff, content check) → **look at the built result beside the reference** → fix → record → next section. Section 1 is verified before section 2 starts.

Publishing is capped at **2 per section**. A third needs a root cause it hasn't already used — if it can't name a new one it's guessing, and a guess doesn't earn a publish.

## The 6 rules that affect YOU

1. **It decides, it doesn't interview you.** The reference already answers most questions, so asking would hand your job back. It picks what a senior studio would ship, says the choice in one line, and keeps building — tell it if a call was wrong and it fixes that one thing. It only stops for four things: destroying something it didn't create, custom code, publishing to your production domain, or anything needing a credential or your money.
2. **Zero custom code, and never the agent's decision.** Sliders/tabs/forms = native elements. Only a canvas/WebGL effect is even eligible for code, and it must show why T1/T2/T3 can't do it and then ASK you — no answer means it ships the native fallback. Anything else: `/custom-code-once` is the only door and only you can open it.
3. **"Done" = proven, and a green score isn't enough.** Every section is scored against the design, and then it must *look* at the built result beside the reference before it can call it PASS — a percentage can't see a missing line of text. It has scored 98.75% on a section with a whole headline absent. Don't skip-approve mid-verification.
4. **Some things are Designer-only** (IX2 animations, slider init, Symbols). They land in `pending_designer_work.md` — check that list; the agent will tell you it's "partial", never falsely "working".
5. **One source at a time.** A Figma build won't touch URL tools and vice versa — that's intentional (token/speed).
6. **Crash-safe.** New session after a crash → say "resume" — it continues from the last verified section.

## Quick answers

- **Wrong page got built?** You were on a different page/branch in Designer — the agent builds where you are. Open the right page, say "rebuild here".
- **Section invisible?** Likely page/branch mismatch or IX2 opacity — the agent stops and tells you which.
- **Designer disconnected mid-build?** Usually just the tab going idle in the background, not a failed build — the work landed and appears when you focus the tab. Don't ask for a rebuild; that's how a section gets built twice.
- **Want it on another site later?** Say so BEFORE building → portable mode.
- **Figma changed after caching?** Say "re-run figma-setup" — the cache is a snapshot.
- **Animations?** Describe the motion or give a reference site. Hover/transitions build now; scroll/load animations = Designer work (pending list), and it measures that they actually run before calling them done.
- **Approving a prompt every few seconds?** The permission rules didn't get merged — see `settings-permissions.json` in the pack.

## Files it keeps (in `~/docs/memory/webflow/`, per site)

Per site, under `sites/<site-id>/`: `specs/<section>.md` **the written build contract** — what it read out of your source, including anything it assumed · `registry.md` classes/variables/pages · `build_state.json` resume point, statuses, scores and measured cost · `pending_designer_work.md` **your manual to-do for that site only** (another site's leftovers can no longer block this one) · `figma-cache/` + `ref-cache/` fetched sources.

Shared at the root: `impossible_cases.md` what Webflow can't do natively · `error_learnings.md` dated lessons · `scripts/` the verification tools.

**Checks it runs on every section:** pixel score **≥99%** *and* height within 2% *and* no single region >25% wrong · the side-by-side look described in rule 3 · every string from your source actually present on the page · nothing from the plan silently dropped · accessibility + performance (contrast, keyboard, headings, alt, image weight, layout shift, 44px touch targets) · behaviour parity for hover/scroll/load.

Every number in its report is pasted straight from the tool, so you can check it yourself — **a score without that block means it wasn't measured.** A section can't be recorded as verified without a passing score and a report attached.

**Health check any time** (absolute path, one command — that's what the permission rules match):

    node /abs/path/docs/memory/webflow/scripts/wf-doctor.js   # is the environment sane? is any section's state lying?
    node /abs/path/docs/memory/webflow/scripts/wf-lint.js     # do the agent's own rules point at real files?
    bash /abs/path/docs/memory/webflow/scripts/wf-sync.sh     # is the git copy up to date? (--apply copies live → repo)

Replace `/abs/path` with your home directory. `~` and `$WF` don't work here — a permission rule matches a literal prefix, so those forms cost you an approval prompt each.
