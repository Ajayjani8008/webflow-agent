# How To Use The Webflow GOAT Agent

**Full manual.** Plain language. No Webflow-expert knowledge needed to read it.

In a hurry? → [`QUICK-START.md`](QUICK-START.md)

---

## PURPOSE

Building a section in Webflow by hand means reading a design, guessing values, clicking through panels, then eyeballing the result. It is slow and it is never exact.

This agent removes the guessing. It **reads the real numbers out of your design source**, builds the section with **real Webflow elements**, then **screenshots the built page and compares it to the design** — and refuses to call it finished until the match is 99% or better at every screen width. Nothing is "done" because Claude said so; it is done because a tool printed the number.

It also refuses to solve problems with pasted code. Everything is built the way a senior Webflow developer would build it, so your team can still open the Designer afterwards and edit it normally.

---

## USE CASES

1. **Figma frame → live Webflow section.** Caches the Figma file once, then builds section by section from the cache.
2. **Live website → Webflow.** "Build the home page like this site." Reads the site's real computed CSS, not a guess.
3. **Screenshot → Webflow.** OCR reads every word with its position; pixels give the colours and spacing.
4. **HTML/CSS/JS delivery → native Webflow.** Reads the whole folder, runs it in a headless browser, then rebuilds layout *and* behaviour natively. The code never enters your site.
5. **Just a written description → Webflow.** It drafts a spec, states its assumptions in one line, builds.
6. **Whole page, section by section.** One section per chat, with saved progress and "resume".
7. **CMS-driven lists** — blog, resources, team, FAQ. Builds the Collection, the fields, the items, and the bound Collection List.
8. **Reusable components** with props and variants, so a repeated card has one edit point.
9. **Motion** — hover and transitions built natively; scroll/load animations planned and handed to you as an exact Designer script, then measured to prove they run.
10. **Responsive finishing** on every breakpoint (1440 / 991 / 767 / 478), including touch-target sizes.
11. **Debugging** an existing broken section — evidence read from the live site first, theory second.
12. **Audits** — class hygiene, accessibility, performance, SEO fields, CMS schema.
13. **Portable sections** you can copy-paste into a different Webflow site.

## INPUTS

- **One design source per job:** a Figma URL, a screenshot image, a folder/paste of HTML+CSS+JS, a live URL, or a text description.
- **A target:** the Webflow site and the page, opened in the Designer.
- **Your decisions, only where the design is silent** — and only the four things it must ask about (see *Rules*).

## OUTPUTS

- Real Webflow **elements, classes, variables, components and CMS collections** in your site.
- A **written spec** per section (`specs/<section>.md`) — the numbers it read out of your source, including anything it had to assume. This is the build contract.
- A **verification report** — pixel score per breakpoint, height delta, worst region, text-coverage check, accessibility and performance check, behaviour parity — every number pasted straight from the tool.
- **Screenshots** of the built section beside the reference.
- **`build_state.json`** — statuses, scores, measured cost. The resume point for the next chat.
- **`pending_designer_work.md`** — the short list of things Webflow only allows by hand, for you to finish.
- **Updated `registry.md`** so the next section reuses your classes instead of inventing new ones.

## TECHNOLOGY

`Claude Code` · `Webflow MCP` · `Node.js` · `Headless Chrome` · `pixelmatch` · `Figma REST/MCP` · `Tesseract / Apple Vision OCR` · `Markdown skills`

---

## WHERE IT WORKS

| | Works? |
|---|---|
| Claude Code — terminal, desktop app, VS Code, JetBrains | ✅ yes |
| Windows · macOS · Linux | ✅ yes, all three |
| Claude Pro subscription | ✅ yes (heavy daily use → Max is more comfortable) |
| claude.ai **web chat** | ❌ no — the checking scripts need Node on your machine |
| Webflow **free** site | ⚠️ builds fine, but publishing needs a paid plan/hosting |
| A Webflow site you only have read access to | ❌ no — it must be able to edit |

Approach in one line: **read the source → build native → screenshot → score → fix → record.** No step is optional, and each one fails closed.

---

## WHAT YOU NEED

### Must have

| Thing | Why | How to get it |
|---|---|---|
| **Claude Pro / Max** | runs the agent | claude.ai → Settings → Billing |
| **Claude Code** | the agent runs here | `npm install -g @anthropic-ai/claude-code`, then `claude` in a terminal |
| **Webflow account with edit rights** on the target site | it writes real elements | webflow.com |
| **Webflow connector enabled in Claude** | the only way Claude talks to Webflow | claude.ai → Settings → **Connectors** → Webflow → **Connect** → allow the site |
| **Node.js**, current LTS | runs the verification scripts | nodejs.org |
| **Google Chrome** | every screenshot, score, motion and a11y check drives headless Chrome | google.com/chrome |

### Only if you need it

| Thing | Needed when | How |
|---|---|---|
| **Figma access** | building from Figma | Figma connector in Claude, or a `FIGMA_TOKEN` env var for the REST fallback |
| **tesseract** | building from a **screenshot**, on Windows or Linux | Windows: `winget install UB-Mannheim.TesseractOCR`, then add `C:\Program Files\Tesseract-OCR` to PATH. macOS needs nothing — the pack compiles its own Apple Vision OCR. |

Without OCR a screenshot source **cannot** be compiled and the build falls back to hand-typed strings. That exact situation once produced a build carrying 1.4% of its reference. Figma / URL / HTML sources are unaffected.

---

## INSTALL

The pack is a folder of Markdown rules + Node scripts. Installing = putting each file where Claude Code looks for it. There are two ways.

### Way A — let Claude install it (recommended)

**Step 1.** Get the pack on your machine.

```
git clone https://github.com/Ajayjani8008/webflow-agent.git
```
or download the ZIP from GitHub and unzip it. The folder you want is `webflow-goat-agent`.

**Step 2.** Open Claude Code **anywhere** and paste this. Change only the path.

```
Install the Webflow GOAT agent pack for me.

Pack folder: C:\Users\ME\Downloads\webflow-agent-main\webflow-goat-agent

Do this, in order:
1. Read BACKUP-README.md in that folder — it has a table of "pack path -> restore to".
2. Copy every file to the exact destination in that table. Create folders as needed.
   Do not skip skills/, scripts/, docs-memory/, agents/, rules/ or auto-memory/.
3. Run npm install inside ~/docs/memory/webflow/scripts (not at ~).
4. Run wf-doctor.js and wf-lint.js with absolute paths and show me the raw output.
5. settings-permissions.json: do NOT edit my settings.json yourself.
   Print the exact JSON I need to paste, with <SCRIPTS> already replaced by my real
   absolute scripts path, and both slash directions if I am on Windows.
6. Tell me anything that is missing on my machine (Node, Chrome, tesseract, connectors).
```

**Why can't Claude do step 5?** Claude Code blocks any agent from widening its own permissions. That is a good rule — so this one step is yours.

**Step 3.** Merge the permissions.

```
/update-config
```
Then say: *"merge the allow and deny lists from `settings-permissions.json` into my settings, replace `<SCRIPTS>` with my absolute scripts path, keep both slash directions on Windows."*

Or open `~/.claude/settings.json` and paste them in by hand. **Merge, never replace** — that file also holds your model, theme, plugins and env.

**Step 4.** Check it.

```
node C:/Users/ME/docs/memory/webflow/scripts/wf-doctor.js
node C:/Users/ME/docs/memory/webflow/scripts/wf-lint.js
```

`wf-doctor` should say: **25 pipeline scripts present**, dependencies resolvable **from the scripts dir**, Chrome found. `wf-lint` should be **0 errors, 0 warnings**.

### Way B — install by hand

Same result, more clicking. `~` means your home folder (`C:\Users\you`, `/Users/you`, `/home/you`).

| Copy this | To here | What it is |
|---|---|---|
| `CLAUDE.md` | `~/CLAUDE.md` | the router — loaded in **every** chat, so it stays tiny |
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` | the agent pointer |
| `skills/*` | `~/.claude/skills/` | 16 skills, loaded only when needed |
| `scripts/*` | `~/docs/memory/webflow/scripts/` | the build + verification pipeline (25 scripts + `package.json` + lock + test) |
| `docs-memory/*` | `~/docs/memory/webflow/` | learnings, limits, per-site state, `sites/_template/` |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | routing rules |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | cross-session knowledge |
| `settings-permissions.json` | **MERGE** into `~/.claude/settings.json` | permission rules |
| `how-to-use.md`, `QUICK-START.md`, `HOW-TO-USE-AGENT.md`, `CHANGELOG.md` | `~/docs/memory/webflow/` | docs, never loaded during a build |

Then: `npm install` in `~/docs/memory/webflow/scripts`, merge permissions, run `wf-doctor` + `wf-lint`.

---

## CONFIGURE

### 1. Permissions — the one setting that decides whether this feels fast

Every check the agent runs is a shell command or an MCP call. Without a permission rule, **each one stops and asks you**. People get tired of clicking, they deny something, and a denied check is a **skipped check** — which is how a bad build once passed every gate that actually ran.

Two things must both be true for a rule to match:

1. The rule's path is the **absolute literal path** to your scripts folder.
2. The command is invoked as **one command, absolute path, nothing before it.**

```
✅ node C:/Users/me/docs/memory/webflow/scripts/wf-doctor.js

❌ cd $WF/scripts && node wf-doctor.js      compound — the rule sees `cd`
❌ WF=~/docs/...; node $WF/scripts/x.js     a variable is not a literal path
❌ node ~/docs/memory/webflow/scripts/x.js  `~` is not the literal path
```

On **Windows keep both slash directions** (`C:/Users/...` and `C:\Users\...`). The Bash tool writes forward slashes, PowerShell writes backslashes, and a rule matches a literal prefix — one direction alone still prompts for half the pipeline.

**Two tools stay in the deny list on purpose:** `data_whtml_builder` (injects raw HTML) and `data_scripts_tool` (registers custom scripts). That is the no-custom-code rule enforced by the tool instead of by the agent's willpower. Keep them denied even when a build feels stuck — the answer is a simpler native approach, not an escape hatch.

### 2. Webflow connector

claude.ai → Settings → **Connectors** → Webflow → **Connect** → approve the sites you want reachable. New site added later? Reconnect, or it will not appear in the site list.

The agent **never assumes which site** you mean. It derives the site id from the live site list, or seeds a new folder from `sites/_template/`. A made-up folder name splits one site's memory across two directories, neither complete.

### 3. Figma (only for Figma builds)

Easiest: the **Figma connector** in Claude. It needs a Figma editor seat. No seat → set `FIGMA_TOKEN` in your environment and the pack uses the Figma REST API instead. Neither one → it will ask you for a screenshot instead.

Run once per project:

```
/figma-setup <figma-url>
```

That caches the file locally so sections build from cache instead of re-fetching. Design changed later? Say *"re-run figma-setup"* — the cache is a snapshot, not a live link.

### 4. Chrome

Auto-detected: Windows `C:/Program Files/Google/Chrome/Application/chrome.exe` · macOS `/Applications/Google Chrome.app/...` · Linux `google-chrome` on PATH. If `wf-doctor` cannot find it, install Chrome — Edge and Firefox are not used.

---

## HOW TO PROMPT IT

### The shape of a good prompt

```
[verb]  +  [what]  +  [where]  +  [source]
Build      the hero    on this page   from this Figma: <url>
```

You do not need special words. Plain English is enough. Before you type, **open the Webflow Designer on the target page** — the agent builds where you are looking.

### One recipe per source type

| You have | Say this | What it does |
|---|---|---|
| **Figma** | `Build the hero on this page from this Figma: <url>` | one-time cache, then builds from cache |
| **Live site** | `Build the home page hero like this site: https://example.com` | pulls the real computed CSS + reference screenshots |
| **React/Vue/SPA/Storybook** | `Build this component: http://localhost:3000/hero` | treated as a live URL, waits for hydration; framework class names never leak into your site |
| **Screenshot** | paste the image + `Build this` | OCR reads every string with position; pixels give colours and spacing |
| **HTML/CSS folder** | `Build this section from the HTML in ./delivery/hero/` | reads the whole delivery, runs it headless, rebuilds native — layout **and** hover/scroll/load behaviour |
| **Only an idea** | `Build a 3-column pricing section: 3 tiers, monthly/yearly toggle, middle highlighted` | drafts a spec, states its assumptions, builds |

**One source per job.** A Figma build will not touch URL tools and vice versa. That is deliberate — mixing sources doubles the cost and halves the accuracy.

### Honest limits of a screenshot source

It prints these every time, so you are never surprised:
- **Font family cannot be known from an image** — it names the substitute it used.
- **Font size is a ±1px estimate** — it cross-checks against the render before building.

Have the real design file? Use it. A screenshot is the fallback, not the preference.

### More prompts you will actually use

```
Fix the hero on mobile — the heading overflows at 390px
Make the CTA background #111 and the radius 8px          ← fast lane, no big process
Audit the classes on this page and tell me what is duplicated
Set up a Blog collection: title, slug, cover image, body, author, date
Make this card a component with props for the title, text, icon and link
Add the scroll reveal from this reference: <url>
Resume                                                    ← after a crash or a new chat
T0 — just change it                                       ← when a tiny edit feels over-processed
```

### How big a job gets how much process

It picks a lane **before** loading anything, so a small ask stays small.

| You say | Lane | What happens |
|---|---|---|
| "make the CTA blue", "16px gap", "fix this typo" | **T0** | changes it, reads back proof, one screenshot of that element. No intake, no scoring sweep |
| "build this hero from Figma/HTML" | **T1** | full pipeline: intake → native build → pixel-verify → responsive |
| "build the whole page" | **T2** | **one section per chat.** It finishes, records, hands off. Start the next in a fresh chat and it resumes from `build_state.json` — a long chat costs more per turn than a fresh one |
| "the hero broke on mobile", "the animation doesn't fire" | **T3** | evidence first — reads the real live state before theorising — then fixes at that layer only |
| "audit my classes", "set up the CMS schema" | **T4** | read-back + report, no pixel scoring (nothing visual changed) |
| "can Webflow do X?" | **question** | just answers. Costs nothing to a build |

### Commands — these are the only ones

| Command | What it does | When |
|---|---|---|
| `/figma-setup <url>` | caches a Figma file locally, once | start of a Figma project |
| `/portable on` · `/portable off` | bakes raw values instead of variables, so the section survives copy-paste into another site | **before** building a section you will reuse cross-site |
| `/custom-code-once` | one-time exception to the no-code ban — one snippet, logged, ban restores | only when you truly require custom JS/CSS |
| `/webflow-help` | the cheat sheet | anytime |

Everything else (design-intake, pixel-verify, responsive-pass, cms-build, motion-build …) runs on its own. You never call those.

---

## WHAT HAPPENS PER SECTION

Read exact values → build native elements + classes → publish once → verify against the source (every breakpoint scored, DOM diff, content check) → **look at the built result beside the reference** → fix → record → next section. **Section 1 is verified before section 2 starts.**

**Checks that run on every section:**

- pixel score **≥99%** *and* height within **2%** *and* no single region more than **25%** wrong
- the side-by-side look (a script cannot see a render — see rule 3)
- **every string** from your source is actually present on the page
- nothing from the plan silently dropped
- accessibility + performance: contrast, keyboard, headings, alt text, image weight, layout shift, 44px touch targets
- behaviour parity for hover / scroll / load

**Publishing is capped at 2 per section.** A third needs a root cause it has not already used. If it cannot name a new one, it is guessing — and a guess does not earn a publish.

**Cost budget per section:** ≤25 tool calls · ≤35 turns · ≤50k peak context. If it goes over, it says so in one line and keeps going.

---

## THE RULES THAT AFFECT YOU

1. **It decides, it does not interview you.** The design already answers most questions. It picks what a senior studio would ship, says the choice in one line, and keeps building. A wrong call? Tell it and it fixes that one thing. It stops for exactly four things: destroying something it did not create, custom code, publishing to your production domain, or anything needing a credential or your money.
2. **Zero custom code, and never the agent's choice.** Sliders, tabs, forms = native elements. Only a canvas/WebGL effect is even eligible for code, and it must first show why the native tiers cannot do it, then **ask you**. No answer = it ships the native fallback. `/custom-code-once` is the only door and only you can open it.
3. **"Done" = proven, and a green score is not enough.** After scoring, it must *look* at the built result beside the reference before it can say PASS. A percentage cannot see a missing line of text — a real section once scored **98.75% PASS with an entire headline absent**. Don't skip-approve mid-verification.
4. **Some things are Designer-only** — scroll/load animations (IX2), slider init, Symbols. They land in `pending_designer_work.md`. It will say "partial", never a false "working".
5. **One source at a time.** Deliberate, for speed and cost.
6. **Crash-safe.** New chat after a crash → say **"resume"**. It continues from the last verified section.

---

## CHANGING THINGS — WHERE TO EDIT WHAT

Everything is plain Markdown or JSON. No build step. Edit, save, start a new chat — the change is live.

| Want to change | Edit this | Notes |
|---|---|---|
| The always-on rules (lane table, the 6 invariants, cost budget, paths) | `~/CLAUDE.md` | loaded in **every** chat — keep it under ~6KB or every chat pays for it |
| How a build actually runs (the pipeline, the gates) | `~/.claude/skills/webflow-core/SKILL.md` | the real rulebook; loads only on build lanes |
| What "native" means, the element/CSS mapping, known traps | `~/.claude/skills/build-reference/SKILL.md` | |
| What gets read from a design before building | `design-intake` / `url-intake` / `html-intake` skills | one per source type |
| The pass floor, scoring, the side-by-side gate | `pixel-verify` skill + `scripts/verify-section.js` | lowering the floor is how quality was lost once already |
| Breakpoints and responsive rules | `responsive-pass` skill | defaults: 1440 / 991 / 767 / 478 |
| Permissions / allow-deny | `~/.claude/settings.json` | merge from `settings-permissions.json`, never replace |
| Cross-site portability | `/portable on` in chat, or the `portable-mode` skill | decide **before** building |
| Your site's classes, variables, progress, to-dos | `~/docs/memory/webflow/sites/<site-id>/` | your project memory — safe to read, careful when editing |
| A lesson you want it to never repeat | `~/docs/memory/webflow/error_learnings.md` | dated entries; it greps this file |
| Something Webflow genuinely cannot do | `~/docs/memory/webflow/impossible_cases.md` | stops it retrying an impossible thing |

**Easiest way to change a rule:** just tell Claude. *"Add a rule to webflow-core: never use min-height on a section, use padding."* It edits the skill file for you.

**After editing anything in the pack, run `wf-lint`.** It byte-compares your live install against the git copy, so it catches a half-finished edit and a rule pointing at a file that no longer exists.

### The three-copies trap

A working install exists in three places at once:

1. **live** — `~/.claude/skills/`, `~/CLAUDE.md`, `~/.claude/agents/webflow/`, `~/docs/memory/webflow/`
2. **the git clone** — wherever you cloned it (`WF_REPO`)
3. **any second clone** you unzipped somewhere else

Live is the truth — it is what the agent loads. Edit live, then sync into the repo:

```
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh           # check only, changes nothing
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh --apply   # copy live -> repo
```

It never edits live and never commits — you review the diff and commit yourself. A file changed in only one copy gets silently reverted by the next restore. That has already happened: a clone once sat three patch versions behind on the docs.

Files are **LF**, enforced by `.gitattributes`, because the lint compare is byte-for-byte. A CRLF checkout reports false drift on every file.

---

## UPDATING THE PACK

```
cd <your clone> && git pull
```

Then in Claude Code:

```
Re-install the Webflow GOAT pack from <clone path> using BACKUP-README.md,
then run wf-doctor.js and wf-lint.js and show me the output.
```

Your per-site state (`sites/<site-id>/`) is yours — a restore keeps it. Read `CHANGELOG.md` to see what changed.

---

## TROUBLESHOOTING

| Symptom | What is really happening | Fix |
|---|---|---|
| Claude asks permission every few seconds | permissions never merged, or the rule path is not the literal absolute path | merge `settings-permissions.json`; keep both slash directions on Windows |
| The wrong page got built | the agent builds where **you** are looking, and you were on another page or branch in the Designer | open the right page, say "rebuild here" |
| The section is invisible | page/branch mismatch, or an IX2 animation left opacity at 0 | it stops and tells you which — read that line |
| "Designer disconnected" mid-build | almost always a background browser tab going idle, **not** a failed build. The work landed and appears when you focus the tab | focus the tab. **Do not ask for a rebuild** — that is how a section gets built twice |
| Score is high but it looks wrong | a percentage cannot see a missing text line | that is exactly what rule 3's side-by-side gate is for — don't skip-approve it |
| A small edit feels heavy | it picked a build lane | say "T0" or "just change it" |
| Screenshot source fails to compile | no OCR installed | install `tesseract` (Windows/Linux); macOS needs nothing |
| Figma numbers look stale | the cache is a snapshot from `/figma-setup` | say "re-run figma-setup" |
| Animation never fires | scroll/load animation = Designer work | check `pending_designer_work.md` — it hands you an exact build script |
| Chat crashed mid-page | progress is on disk | new chat → "resume" |
| Lint reports drift on every file | CRLF checkout | re-clone so `.gitattributes` applies (LF) |
| Something is wrong and you want receipts | every number it prints is copied from a tool | ask: *"show me the raw tool output for that score"* — no proof block means it was not measured |

---

## FILES AND FOLDERS

```
~/CLAUDE.md                          the router, loaded every chat
~/.claude/
├── agents/webflow/webflow-goat.md    the agent
├── skills/<16 skills>/SKILL.md       the rules, loaded per lane
├── rules/common/agents.md            routing
└── settings.json                     YOUR permissions live here

~/docs/memory/webflow/
├── scripts/                          25 pipeline scripts + package.json
├── error_learnings.md                dated lessons
├── impossible_cases.md               what Webflow cannot do natively
├── CHANGELOG.md                      version history
└── sites/
    ├── _template/                    seed for a new site
    └── <site-id>/
        ├── specs/<section>.md         the build contract
        ├── registry.md               classes, components, variables, motion
        ├── build_state.json          statuses, scores, cost, resume point
        ├── pending_designer_work.md  YOUR manual to-do
        └── figma-cache/ ref-cache/   fetched sources, never re-fetched
```

`<site-id>` is **derived, never invented** — matched from existing state, else the site's slug from Webflow, else seeded from `_template/`. `wf-resolve.js` does this and locks the target.

### Useful commands

```
node C:/Users/ME/docs/memory/webflow/scripts/wf-doctor.js    is my setup sane? is any status lying?
node C:/Users/ME/docs/memory/webflow/scripts/wf-lint.js      is the pack intact and consistent?
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh      is my git copy up to date?
```

Always the **absolute path, one command, nothing before it** — otherwise you pay an approval prompt each time.

---

## FAQ

**Do I need to know Webflow?** No. You need to know what you want it to look like. It builds the way a Webflow developer would, so your team can still edit it by hand later.

**Will it add code to my site?** No. The two tools that could inject HTML or scripts are denied at the permission level.

**Can it build my whole site in one go?** No, and that is on purpose. One section per chat is faster, cheaper and more accurate. It remembers where it stopped.

**Will it break what I already built?** It only touches what you point it at, and it snapshots before destroying anything it did not create itself. Webflow has no undo API — that snapshot is the undo.

**Does it publish to my live domain?** Only if you say so. Publishing to production is one of the four things it always asks about.

**Can two people use it on the same site?** Yes, but not at the same time on the same page. The per-site state files are the shared memory — commit them if your team shares the repo.

**Is it exact?** Pass floor is 99% pixel match plus the checks listed above. Real builds land at 98.5–99.9%. Anything below the floor is reported as still open, not quietly accepted.

**What if Webflow simply cannot do the effect?** It writes it into `impossible_cases.md`, ships the closest native version, and tells you what the difference is.

---

## GLOSSARY

| Word | Plain meaning |
|---|---|
| **native** | built from real Webflow elements and classes, not pasted code |
| **MCP** | the connector that lets Claude talk to Webflow |
| **intake** | reading and writing down what your design actually says, before building |
| **spec** | that written result — the contract the build is judged against |
| **pixel-verify** | screenshot the built page, compare it to the design, print a score |
| **breakpoint** | a screen-width version of the design (1440 / 991 / 767 / 478) |
| **lane (T0–T4)** | how much process a job gets, chosen by size |
| **IX2** | Webflow's animation system — scroll/load animations only exist in the Designer |
| **portable** | values baked in instead of variables, so a section survives copy-paste to another site |
| **gate** | a check that must pass before the next step; all of them fail closed |
| **read-back** | asking Webflow what is actually there now, instead of trusting what was just written |

---

*Quick version → [`QUICK-START.md`](QUICK-START.md) · install/restore detail → `BACKUP-README.md` · in-chat cheat sheet → `/webflow-help` · history → `CHANGELOG.md`*
