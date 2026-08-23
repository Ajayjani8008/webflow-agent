# How To Use The Webflow GOAT Agent

**Daily use.** Plain language. You do not need to know Webflow to read this.

Not set up yet? → [`README.md`](README.md) first. Nothing here works without it.

**Jump to:** [What it does](#what-it-does) · [Prompt library](#prompt-library) · [Copy a section to another site](#copy-a-section-to-another-webflow-site) · [How big a job gets how much process](#how-big-a-job-gets-how-much-process) · [Commands](#commands) · [What it does per section](#what-it-does-per-section) · [The rules that affect you](#the-rules-that-affect-you) · [Changing the agent](#changing-the-agent) · [Troubleshooting](#troubleshooting) · [FAQ](#faq) · [Words explained](#words-explained)

---

## What it does

Building a section by hand means reading a design, guessing values, clicking panels, then eyeballing the result. Slow, and never exact.

This agent removes the guessing. It **reads the real numbers out of your design**, builds with **real Webflow elements**, then **screenshots the built page and compares it to the design** — and refuses to say "done" below a 99% match at every screen width. Nothing is finished because Claude claims it; it is finished because a tool printed the number.

It also refuses to solve problems with pasted code. Everything is built the way a senior Webflow developer would build it, so your team can still open the Designer and edit it normally.

### What people use it for

1. **Figma frame → live Webflow section** (caches the file once, then builds from cache)
2. **Live website → Webflow** — "build the home page like this site"; reads the real computed CSS, not a guess
3. **Screenshot → Webflow** — OCR reads every word with its position; pixels give colours and spacing
4. **HTML/CSS/JS folder → native Webflow** — reads the whole delivery, runs it headless, rebuilds layout *and* behaviour natively; the code never enters your site
5. **A written description → Webflow** — drafts a spec, states its assumptions, builds
6. **A whole page**, section by section, with saved progress and "resume"
7. **CMS lists** — blog, resources, team, FAQ: collection, fields, items, and the bound Collection List
8. **Reusable components** with props and variants, so a repeated card has one edit point
9. **Motion** — hover and transitions built natively; scroll/load animations handed to you as an exact Designer script, then measured to prove they run
10. **Responsive finishing** at 1440 / 991 / 767 / 478, including touch-target sizes
11. **Fixing** an existing broken section — evidence read off the live site first, theory second
12. **Audits** — class hygiene, accessibility, performance, SEO fields, CMS schema
13. **Portable sections** you can paste into a different Webflow site

### What you put in, what you get out

| You give | You get back |
|---|---|
| **one** design source (Figma URL · screenshot · HTML folder · live URL · description) | real Webflow elements, classes, variables, components, CMS collections in your site |
| the target: the site + page, open in the Designer | a written **spec** per section — every number it read, and anything it had to assume |
| your decisions, only where the design is silent | a **verification report** — pixel score per breakpoint, height delta, worst region, text coverage, accessibility, performance, behaviour — every number pasted from the tool |
| | screenshots of built vs reference |
| | `build_state.json` — statuses, scores, cost, the resume point |
| | `pending_designer_work.md` — the short list Webflow only allows by hand |
| | an updated `registry.md`, so the next section reuses your classes instead of inventing new ones |

Built on: `Claude Code` · `Webflow MCP` · `Node.js` · `headless Chrome` · `pixelmatch` · `Figma REST/MCP` · `Tesseract / Apple Vision OCR`

---

## Prompt library

Copy, change the details, send. Plain English is enough — there is no magic wording.

### Start a build

```
Build the hero section on this page from this Figma: <figma-url>
```
```
Build the home page hero like this site: https://example.com
```
```
Build this section from the HTML in ./delivery/hero/
```
```
Build this
    ← paste the screenshot in the same message
```
```
Build a 3-column pricing section: 3 tiers, monthly/yearly toggle, middle tier
highlighted, real prices 19 / 49 / 99 per month
```
```
Build the whole about page from this Figma: <url>
Start with the first section only, then tell me what is next.
```

### Small changes (fast lane — no big process)

```
Make the CTA background #111 and the corner radius 8px
```
```
The gap between the cards should be 24px, not 16px
```
```
Fix the typo in the hero subheading: "recieve" -> "receive"
```
```
T0 — just change it
    ← use when a tiny edit is being treated like a build
```

### Fix something broken

```
The hero overflows sideways at 390px. Find the cause before changing anything.
```
```
The nav dropdown is 12px too tall compared to the reference. What is causing it?
```
```
This section looks fine at 1440 but breaks at 767. Fix it and re-verify.
```
```
The scroll animation never fires. Is it built, or is it on the Designer to-do list?
```

### CMS

```
Set up a Blog collection: title, slug, cover image, rich text body, author, publish date.
Then build the blog grid on this page bound to it, 3 across, newest first.
```
```
Add 6 real team members to the Team collection from this list, then bind the team grid.
```

### Components and reuse

```
This card repeats 4 times. Make it a component with props for the title, body, icon and link.
```
```
Add a variant of this button component for the dark section.
```

### Motion

```
Add the hover states from the Figma: card lifts 4px, shadow grows, 200ms ease-out.
```
```
Match the scroll reveal on this reference site: <url>
Tell me which parts are native and which land on the Designer to-do list.
```

### Check, verify, publish

```
Re-verify this section against the reference and show me the raw score output.
```
```
Show me the raw tool output for that score
    ← ask this any time a number looks too good
```
```
Audit this page: classes, accessibility, performance, SEO fields.
```
```
What is still open on this site? Read pending_designer_work.md and build_state.json.
```
```
Publish this to the staging domain only.
```

### Session control

```
Resume
    ← after a crash, or in a fresh chat to continue a page
```
```
Which section are we on, and what was the last score?
```

### Questions (cheap, no build)

```
Can Webflow do a gradient on text natively?
```
```
Why is this 99% and not 100%? What is the missing 1%?
```

---

## Copy a section to another Webflow site

Use this when the target site lives on **someone else's Webflow account** (a client's), or when you want one section reused across projects.

### Decide BEFORE you build

A normal build wires classes to **this site's variables** (`var(--space-lg)`). Variables are pointers into *this project's* database. On another site those pointers are dangling — **the layout collapses on paste.** Switching afterwards does not retro-fix classes already written; you end up half-portable, which looks fine in the Designer and breaks on paste.

So, first:

```
/portable on
```

Then build as usual. Portable mode bakes literal values into every class and keeps the section self-contained. Accuracy does not change — the literal must equal the variable's value exactly, and the same 99% floor applies.

Turn it off again for normal single-site work:

```
/portable off
```

Not sure? Ask before building:

```
This section is going to a client's site on their own Webflow account.
Should we build it in portable mode? Explain what changes.
```

### Then copy it across

1. Build and verify the section in **your** site (portable ON).
2. Ask for the handover list:
   ```
   Give me the portability report for this section: what travels on paste,
   and what I must redo on the target site.
   ```
3. In **your** Designer: select the section's top element → **Ctrl/Cmd + C**.
4. In the **target site's** Designer, on the target page → **Ctrl/Cmd + V**.
   Both Designer tabs must be open in a browser where you are logged in with an account that can edit that site. Different accounts → log into each in its own browser window/profile.
5. Work through the "manual on target" list below. Then re-check the paste at every breakpoint before calling it delivered.

### What travels, and what does not

| Travels on paste | You must redo on the target site |
|---|---|
| structure (the element tree) | **fonts** — they do not travel; install the exact families first or the block renders in fallbacks |
| all text content | **sliders, tabs, navbars** — they paste as dead shells until re-initialised in the Designer |
| image URLs | **interactions** — page-level scroll/load animations do not travel (component-scoped ones do); rebuild from the script in `registry.md` |
| class styles, including `:hover` | **CMS bindings** — rebind to the target's collections, or make them static if single-use |
| | **components / Symbols** — rebuild on the target, or share via a Webflow Library |
| | **class name collisions** — if the target already owns `.card`, prefix yours |

**Whole design to reuse, not one section?** Say so — a **cloneable project** is the better answer and the agent will tell you the same. A clone carries variables, interactions, CMS schema and symbols; portable classes carry none of that.

---

## How big a job gets how much process

The agent picks a lane **before** loading any rules, so a small ask stays small.

| You say | Lane | What happens |
|---|---|---|
| "make the CTA blue", "16px gap", "fix this typo" | **T0** | changes it, reads back proof, one screenshot of that element. No intake, no scoring sweep |
| "build this hero from Figma/HTML" | **T1** | full pipeline: read source → build native → verify pixels → responsive pass |
| "build the whole page" | **T2** | **one section per chat.** It finishes, records, hands off. Next chat resumes from `build_state.json` — a long chat costs more per turn than a fresh one |
| "the hero broke on mobile", "the animation doesn't fire" | **T3** | evidence first — reads the real live state before theorising — then fixes at that layer only |
| "audit my classes", "set up the CMS schema" | **T4** | read-back + report. No pixel scoring, because nothing visual changed |
| "can Webflow do X?" | **question** | just answers. Costs a build nothing |

Small task feeling over-processed? Say **"T0"** or **"just change it"**.

---

## Commands

These four are the only ones you type. Everything else is automatic.

| Command | What it does | When |
|---|---|---|
| `/figma-setup <url>` | caches a Figma file locally, once | start of a Figma project. Design changed later → *"re-run figma-setup"*, the cache is a snapshot |
| `/portable on` · `/portable off` | portable mode — see [Copy a section to another site](#copy-a-section-to-another-webflow-site) | **before** building a section that must move sites |
| `/custom-code-once` | one-time exception to the no-code ban: one snippet, logged, ban restores | only when you truly require custom JS/CSS. The agent will never suggest this |
| `/webflow-help` | the short in-chat cheat sheet | anytime |

Skills like design-intake, pixel-verify, responsive-pass, cms-build and motion-build run on their own. You never call them.

---

## What it does per section

Read exact values → build native elements + classes → publish once → verify against the source (every breakpoint scored, DOM diff, content check) → **look at the built result beside the reference** → fix → record → next section. **Section 1 is verified before section 2 starts.**

**Every section is checked for:**

- pixel score **≥99%**, *and* height within **2%**, *and* no single region more than **25%** wrong
- the side-by-side look — a script cannot see a render (see rule 3)
- **every string** from your source actually present on the page
- nothing from the plan silently dropped
- accessibility + performance: contrast, keyboard, headings, alt text, image weight, layout shift, 44px touch targets
- behaviour parity for hover / scroll / load

**Publishing is capped at 2 per section.** A third needs a root cause it has not already used. If it cannot name a new one, it is guessing — and a guess does not earn a publish.

**Cost budget per section:** ≤25 tool calls · ≤35 turns · ≤50k peak context. Over budget → it says so in one line and keeps going.

---

## The rules that affect you

1. **It decides, it does not interview you.** The design already answers most questions. It picks what a senior studio would ship, says the choice in one line, and keeps building. Wrong call? Tell it, and it fixes that one thing. It stops for exactly four things: destroying something it did not create, custom code, publishing to your production domain, and anything needing a credential or your money.
2. **Zero custom code, and never the agent's choice.** Sliders, tabs, forms = native elements. Only a canvas/WebGL effect is even eligible for code, and it must first prove the native tiers cannot do it, then **ask you**. No answer = native fallback ships. `/custom-code-once` is the only door and only you can open it.
3. **"Done" = proven, and a green score is not enough.** After scoring it must *look* at the built result beside the reference before it can say PASS. A percentage cannot see a missing line of text — a real section once scored **98.75% PASS with an entire headline absent**. Do not skip-approve mid-verification.
4. **Some things are Designer-only** — scroll/load animations (IX2), slider init, Symbols. They land in `pending_designer_work.md`. It will say "partial", never a false "working".
5. **One source at a time.** A Figma build will not touch URL tools and vice versa. Deliberate: mixing sources doubles the cost and halves the accuracy.
6. **Crash-safe.** New chat after a crash → say **"resume"**. It continues from the last verified section.

---

## Changing the agent

Everything is plain Markdown or JSON. No build step. Edit, save, start a new chat — the change is live.

**Easiest way:** just tell Claude.
```
Add a rule to webflow-core: never use min-height on a section, use padding instead.
```
It edits the right file for you.

| Want to change | Edit this | Notes |
|---|---|---|
| The always-on rules (lane table, invariants, budget, paths) | `~/CLAUDE.md` | loaded in **every** chat — keep it under ~6KB or every chat pays for it |
| How a build actually runs (pipeline, gates) | `~/.claude/skills/webflow-core/SKILL.md` | the real rulebook; loads only on build lanes |
| What "native" means, element/CSS mapping, known traps | `~/.claude/skills/build-reference/SKILL.md` | |
| What gets read from a design before building | `design-intake` / `url-intake` / `html-intake` skills | one per source type |
| The pass floor, scoring, the side-by-side gate | `pixel-verify` skill + `scripts/verify-section.js` | lowering the floor is how quality was lost once already |
| Breakpoints and responsive rules | `responsive-pass` skill | defaults 1440 / 991 / 767 / 478 |
| Permissions | `~/.claude/settings.json` | merge from `settings-permissions.json`, never replace |
| Your site's classes, variables, progress, to-dos | `~/docs/memory/webflow/sites/<site-id>/` | your project memory — safe to read, careful when editing |
| A lesson it must never repeat | `~/docs/memory/webflow/error_learnings.md` | dated entries; the agent greps this |
| Something Webflow genuinely cannot do | `~/docs/memory/webflow/impossible_cases.md` | stops it retrying an impossible thing |

**After any pack edit, run `wf-lint`** — it byte-compares your live install against the git copy, so it catches a half-finished edit and a rule pointing at a file that no longer exists. Then `wf-sync.sh --apply` to push live into the repo. Details in [`README.md`](README.md#updating-the-pack).

### Where your files are

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
        ├── pending_designer_work.md  YOUR manual to-do list
        └── figma-cache/ ref-cache/   fetched sources, never re-fetched
```

`<site-id>` is **derived, never invented** — matched from existing state, else the site's slug from Webflow, else seeded from `_template/`. A guessed folder name splits one site's memory across two directories, neither complete.

### Commands you can run yourself

```
node C:/Users/ME/docs/memory/webflow/scripts/wf-doctor.js    is my setup sane? is any status lying?
node C:/Users/ME/docs/memory/webflow/scripts/wf-lint.js      is the pack intact and consistent?
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh      is my git copy up to date?
```

Always **absolute path, one command, nothing before it** — otherwise you pay an approval prompt each time.

---

## Troubleshooting

| Symptom | What is really happening | Fix |
|---|---|---|
| Claude asks permission every few seconds | permission rules not merged, or the rule is not the literal absolute path | [`README.md` C.4](README.md#c4--merge-the-permissions--do-not-skip) |
| "designer_tool failed" / "bridge disconnected" | bridge app not launched on this site, or the Designer tab went idle in the background | focus the tab. **Do not ask for a rebuild** — the element and style writes already landed and appear when the tab wakes |
| The agent cannot see my site | the site was not approved during authorize, or the wrong Webflow account is connected | re-authorize in claude.ai → Connectors, then say `list my Webflow sites` |
| Tools authorize fine but nothing reaches the canvas | the connected Webflow account is not the account logged into the Designer | one account on both sides — [`README.md` B.3](README.md#b3---the-account-rule--read-this-before-anything-else) |
| The wrong page got built | the agent builds where **you** are looking, and you were on another page or branch | open the right page, say "rebuild here" |
| The section is invisible | page/branch mismatch, or an interaction left opacity at 0 | it stops and tells you which — read that line |
| Score is high but it looks wrong | a percentage cannot see a missing text line | that is what rule 3's side-by-side gate is for — do not skip-approve it |
| A small edit feels heavy | it picked a build lane | say "T0" or "just change it" |
| Screenshot source will not compile | no OCR installed | Tesseract on Windows/Linux; macOS needs nothing |
| Figma numbers look stale | the cache is a snapshot | "re-run figma-setup" |
| An animation never fires | scroll/load animation = Designer work | check `pending_designer_work.md` — it hands you an exact build script |
| Pasted section collapsed on the target site | it was not built in portable mode, so its classes point at the source site's variables | rebuild that section with `/portable on`, or have the agent rewrite those classes to literals |
| Pasted section renders in the wrong font | fonts never travel on paste | install the exact families on the target site first |
| Chat crashed mid-page | progress is on disk | new chat → "resume" |
| `wf-lint` reports drift on every file | CRLF checkout | re-clone so `.gitattributes` applies (LF) |
| You want the receipts | every number it prints is copied from a tool | *"show me the raw tool output for that score"* — no proof block means it was not measured |

---

## FAQ

**Do I need to know Webflow?** No. You need to know what it should look like. It builds the way a Webflow developer would, so your team can still edit by hand afterwards.

**Will it add code to my site?** No. The two tools that could inject HTML or scripts are denied at the permission level, not left to the agent's judgment.

**Can it build my whole site in one go?** No, on purpose. One section per chat is faster, cheaper and more accurate, and it remembers where it stopped.

**Will it break what I already built?** It only touches what you point it at, and it snapshots before destroying anything it did not create. Webflow has no undo API — that snapshot *is* the undo.

**Does it publish to my live domain?** Only if you say so. Production publish is one of the four things it always asks about.

**Can I use it on a client's site?** Yes — either they invite your Webflow account with edit rights (direct build), or you build in your own site and paste across in portable mode. See [Copy a section to another site](#copy-a-section-to-another-webflow-site).

**Can two people use it on the same site?** Yes, but not on the same page at the same time. The per-site state files are the shared memory — commit them if your team shares the repo.

**How exact is it really?** The floor is 99% pixel match plus the checks above. Real builds land at 98.5–99.9%. Anything below the floor is reported as still open, never quietly accepted.

**What if Webflow simply cannot do the effect?** It writes it into `impossible_cases.md`, ships the closest native version, and tells you exactly what the difference is.

**Why did it stop after one section?** That is the design (lane T2). Start a fresh chat and say "resume".

---

## Words explained

| Word | Plain meaning |
|---|---|
| **native** | built from real Webflow elements and classes, not pasted code |
| **MCP / connector** | the link that lets Claude talk to Webflow |
| **bridge app** | the small Webflow app running inside your Designer that lets Claude see your canvas |
| **data tools vs Designer tools** | data tools write through Webflow's API without a browser; Designer tools need your open Designer tab |
| **intake** | reading and writing down what your design actually says, before building |
| **spec** | that written result — the contract the build is judged against |
| **pixel-verify** | screenshot the built page, compare to the design, print a score |
| **breakpoint** | a screen-width version of the design (1440 / 991 / 767 / 478) |
| **lane (T0–T4)** | how much process a job gets, chosen by size |
| **IX2** | Webflow's animation system — scroll/load animations exist only in the Designer |
| **portable** | literal values instead of variables, so a section survives a paste into another site |
| **variable** | a named token (colour, spacing) stored in *this* site — a pointer, which is why it breaks on paste |
| **gate** | a check that must pass before the next step; all of them fail closed |
| **read-back** | asking Webflow what is actually there now, instead of trusting what was just written |

---

*Setup → [`README.md`](README.md) · in-chat cheat sheet → `/webflow-help` · version history → `CHANGELOG.md`*
