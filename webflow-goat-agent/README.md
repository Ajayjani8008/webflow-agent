# Webflow GOAT — Setup Guide

You give a design. Claude builds it inside your real Webflow site, with real Webflow elements — no pasted code — and then proves the result matches the design before saying "done".

This file = **setup, in order**. Do the parts top to bottom, once.
Daily use, prompts and troubleshooting → [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md).

---

## Read this first: two different things

People mix these up and then get stuck. They are separate.

| | What it is | How often |
|---|---|---|
| **PART A — your computer** | Software that must exist on the machine: Node.js, Chrome, (OCR only if you use screenshots) | once per computer |
| **PART B — accounts and access** | Claude subscription, Claude Code, Webflow account, the account rule, the Webflow connector, the Designer bridge app | once, then re-check when a site or account changes |
| **PART C — the agent itself** | Copying the pack files into place, merging permissions, verifying | once, then when you update the pack |

**You do not have to install Part A by hand.** Ask Claude to check and install it — Part A has a copy-paste prompt for exactly that. Part A is *your machine*. Part C is *the agent*. Different jobs.

### Setup order at a glance

```
PART A  computer software      →  Node, Chrome, (OCR)
PART B  accounts + access      →  Claude Pro, Claude Code, Webflow account rule,
                                  connector authorize, Designer bridge app
PART C  install the agent      →  copy pack files, merge permissions, verify
THEN    first build            →  open Designer, one prompt
```

---

# PART A — What your computer needs

Three things. Only the third is optional.

| Software | Why the agent needs it | Optional? |
|---|---|---|
| **Node.js** (current LTS) | The agent's checking tools are Node scripts — screenshots, pixel scoring, accessibility, motion checks | no |
| **Google Chrome** | Every screenshot and score is taken with headless Chrome. Edge and Firefox are not used | no |
| **Tesseract OCR** | Only when your design source is a **screenshot image**. It reads the words out of the picture. macOS needs nothing (the pack compiles Apple's built-in OCR). Windows/Linux need Tesseract | yes — skip unless you build from screenshots |

## A.1 — Let Claude check and install them

Open Claude Code and paste:

```
Check my machine for the Webflow GOAT prerequisites and install what is missing.

1. Is Node.js installed? Print the version. LTS or newer is fine.
2. Is Google Chrome installed? Print the path you found.
3. Is tesseract on PATH? I only need it if I build from screenshots — tell me,
   don't install it yet.

For anything missing, tell me the exact install command for my OS and run it
if it is safe to run unattended. Show me the output.
```

## A.2 — Or install by hand

| | Windows | macOS | Linux |
|---|---|---|---|
| Node.js | `winget install OpenJS.NodeJS.LTS` | `brew install node` | your package manager |
| Chrome | download from google.com/chrome | same | same |
| Tesseract | `winget install UB-Mannheim.TesseractOCR` then add `C:\Program Files\Tesseract-OCR` to PATH | not needed | `sudo apt install tesseract-ocr` |

### ✅ Part A is done when

`node -v` prints a version, and Chrome opens. That's it.

---

# PART B — Accounts and access

This is the part that actually blocks people. Read every step.

## B.1 — Claude subscription

**Claude Pro** works. **Max** is more comfortable if you build every day (a section is a lot of tool calls).
claude.ai → Settings → Billing.

## B.2 — Claude Code

The agent runs in **Claude Code**, not in the claude.ai web chat. The web chat cannot run the checking scripts, so it cannot verify anything.

```
npm install -g @anthropic-ai/claude-code
```
Then type `claude` in a terminal. Desktop app, VS Code and JetBrains all work too.

## B.3 — 🔴 THE ACCOUNT RULE — read this before anything else

**To let the agent build directly into a Webflow site, the Webflow account you connect to Claude must be the account that owns (or has edit rights on) that site — and it must be the same account that is logged into the Designer while the agent works.**

In practice, one login on both sides. Same account in Claude and in Webflow. If they are different, the connector will happily authorize and then the Designer tools cannot reach your canvas — it looks like a broken agent when it is actually the wrong account.

**Your client's site is on the client's Webflow account, and you cannot log in as them?** You have a legal, normal path:

| Path | When | How |
|---|---|---|
| **1. Direct build** | the site is on **your** Webflow account (your own site, or the client invited you as a member with edit rights) | connect that account → build straight into the site |
| **2. Build here, copy there** | the site is on the **client's** account and you cannot use their login | build the section in **your own** Webflow site, then **copy-paste it into their site** in the Designer |

Path 2 is normal agency practice and the agent supports it properly — but you must decide **before** you build, because the section has to be built in **portable mode** or it breaks on paste:

```
/portable on
```

Portable mode bakes real values into the classes instead of pointing at this site's variables. A variable is a pointer to *this project's* database; on the client's site that pointer is dangling and the layout collapses. Full copy-across procedure, and the list of what does **not** travel (fonts, sliders, interactions, CMS bindings) → **"Copy a section to another Webflow site"** in [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md).

## B.4 — Connect Webflow to Claude (authorize)

1. Go to **claude.ai → Settings → Connectors**.
2. Find **Webflow** → **Connect**.
3. A Webflow login/authorize window opens. **Log in as the account from B.3** — the one that owns or can edit the target site.
4. Webflow asks which **workspaces / sites** Claude may reach. **Approve the site you want to build in.** A site you skip here is invisible to the agent later.
5. Back in Claude, the connector shows as connected.

**Checks and gotchas**

- Added a new Webflow site **after** connecting? The agent may not see it. Go back to Connectors and re-authorize, or extend the site access, then ask Claude: *"list my Webflow sites"*.
- Wrong account authorized by accident? Disconnect in Connectors, then connect again with the right login. Do not try to fix it from Claude's side.
- Verify from Claude Code: `list my Webflow sites` — the target site must appear by name.

## B.5 — The Designer bridge app (per site)

Two kinds of Webflow tool exist, and only one needs this:

- **Data tools** — REST API. Create elements, set styles, read pages. Work headless, no browser needed.
- **Designer tools** — talk to your **open Designer canvas**: which page you are on, what is selected, breakpoints, component view. These reach the canvas through a **bridge app that runs inside the Designer**.

Install it once per site:

1. Open the site in the **Webflow Designer**.
2. Open the **Apps** panel in the left toolbar.
3. Find the Webflow **MCP / Claude bridge** app (in the Apps panel, or install it from Webflow's app marketplace — search for the MCP app). Names shift as Webflow rolls features out; it is the app whose job is connecting an AI assistant to the Designer.
4. **Install** it to this site, then **open / launch** it.
5. **Leave that Designer tab open on the target page while the agent works.**

**Symptoms when it is not running:** the agent reports `designer_tool` failing or "bridge disconnected". Almost always one of:
- the app is not installed/launched on this site
- the Designer tab was **backgrounded and went idle** — this is the common one
- you are on a different page or a branch

**Important:** a bridge drop is usually **not** a failed build. Element and style writes go through the data API and land anyway — they appear the moment you focus the tab. **Do not ask for a rebuild.** That is how a section gets built twice.

## B.6 — Figma (skip unless you build from Figma)

Easiest: claude.ai → Settings → **Connectors** → **Figma** → Connect. Needs a Figma editor seat.
No seat? Set `FIGMA_TOKEN` in your environment and the pack uses Figma's REST API instead.
Neither? The agent will ask you for screenshots instead — which is why Tesseract is in Part A.

### ✅ Part B is done when

- `list my Webflow sites` in Claude Code shows your target site
- the Designer is open on the target page with the bridge app running
- you know which of the two paths in B.3 you are on

---

# PART C — Install the agent

The pack is a folder of Markdown rule files + Node scripts. Installing = putting each file where Claude Code looks for it.

## C.1 — Get the pack

```
git clone https://github.com/Ajayjani8008/webflow-agent.git
```
or download the ZIP from GitHub and unzip it. The folder you want is **`webflow-goat-agent`**.

## C.2 — Let Claude install it (recommended)

Open Claude Code and paste this, changing only the path:

```
Install the Webflow GOAT agent pack for me.

Pack folder: C:\Users\ME\Downloads\webflow-agent-main\webflow-goat-agent

Do this, in order:
1. Read the "Where every file goes" table in README.md in that folder.
2. Copy every file to the exact destination in that table. Create folders as needed.
   Do not skip skills/, scripts/, docs-memory/, agents/, rules/ or auto-memory/.
3. Run npm install inside ~/docs/memory/webflow/scripts (in the scripts folder, not at ~).
4. Run wf-doctor.js and wf-lint.js with absolute paths, and show me the raw output.
5. settings-permissions.json: do NOT edit my settings.json yourself.
   Print the exact JSON I need to paste, with <SCRIPTS> already replaced by my real
   absolute scripts path, and both slash directions if I am on Windows.
6. List anything still missing on my machine or in my accounts.
```

**Why can't Claude do step 5?** Claude Code blocks any agent from widening its own permissions. That is a good safety rule — so that one step is yours (C.4 does it in two clicks).

## C.3 — Or install by hand

`~` = your home folder: `C:\Users\you` · `/Users/you` · `/home/you`.

### Where every file goes

| Copy this | To here | What it is |
|---|---|---|
| `CLAUDE.md` | `~/CLAUDE.md` | the router — loaded in **every** chat, so it is deliberately tiny (≤6KB) |
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` | the agent pointer (≤4KB). It does **not** repeat the rules on purpose |
| `skills/*` | `~/.claude/skills/` | 16 skills, loaded only on the lane that needs them |
| `scripts/*` | `~/docs/memory/webflow/scripts/` | the build + verification pipeline: 25 scripts, plus `package.json`, `package-lock.json`, `pixel-diff.test.js` |
| `docs-memory/*` | `~/docs/memory/webflow/` | `error_learnings.md` · `impossible_cases.md` · `v2-rationale.md` · `sites/_template/` (seed for a new site) |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | cross-platform routing |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | cross-session knowledge (MCP gotchas, SVG path, CMS limits) |
| `settings-permissions.json` | **MERGE** into `~/.claude/settings.json` | the permission rules — see C.4 |
| `README.md`, `HOW-TO-USE-AGENT.md`, `CHANGELOG.md` | `~/docs/memory/webflow/` | docs. Never loaded during a build |

Then install the script dependencies **in the scripts folder**:

```
cd ~/docs/memory/webflow/scripts
npm install
```

(`node_modules` is not committed; `package-lock.json` is the reproducible source. Deps: `pixelmatch`, `pngjs`, `ws`.)

## C.4 — Merge the permissions ⚠️ do not skip

Every check the agent runs is a script call or a Webflow call. Without permission rules, **each one stops and asks you to approve it.** People get tired of clicking, deny something, and a denied check is a **skipped check** — that is exactly how a bad build once passed every gate that actually ran.

In Claude Code:

```
/update-config
```
then say:

> merge the allow and deny lists from `settings-permissions.json` into my settings, replace `<SCRIPTS>` with my absolute scripts path, and keep both slash directions on Windows

Or edit `~/.claude/settings.json` by hand. **Merge — never replace.** That file also holds your model, theme, plugins and env.

**Two rules that matter more than they look:**

1. **Absolute literal paths only.** A permission rule matches a *literal prefix*.
   ```
   ✅ node C:/Users/me/docs/memory/webflow/scripts/wf-doctor.js
   ❌ cd $WF/scripts && node wf-doctor.js      compound — the rule sees `cd`
   ❌ node $WF/scripts/wf-doctor.js            a variable is not a literal path
   ❌ node ~/docs/memory/webflow/scripts/x.js  `~` is not the literal path
   ```
2. **On Windows keep BOTH slash directions** (`C:/Users/...` and `C:\Users\...`). The Bash tool writes forward slashes, PowerShell writes backslashes.

**Two Webflow tools stay denied on purpose** — `data_whtml_builder` (injects raw HTML) and `data_scripts_tool` (registers custom scripts). That is the no-custom-code rule enforced by the tool instead of by the agent's willpower. Keep them denied even when a build feels stuck.

## C.5 — Verify the install

```
node C:/Users/ME/docs/memory/webflow/scripts/wf-doctor.js
node C:/Users/ME/docs/memory/webflow/scripts/wf-lint.js
```

- **`wf-doctor`** = is my environment sane, and is any recorded build status lying? It must report **25 pipeline scripts present**, dependencies resolvable **from the scripts folder**, and Chrome found.
- **`wf-lint`** = is the pack itself intact and consistent? Must be **0 errors, 0 warnings**.

Not clean? Paste the output into Claude Code and say *"fix this"*.

### ✅ Part C is done when

both commands come back clean, and neither asked you for permission.

---

# YOUR FIRST BUILD

1. **Open the Webflow Designer** on the page you want, with the bridge app running (B.5). The agent builds **where you are looking**.
2. In Claude Code, say it plainly:

```
Build the hero section on this page from this Figma: <figma-url>
```

Other sources, same shape:

```
Build the home page hero like this site: https://example.com
Build this section from the HTML in ./delivery/hero/
Build this          ← paste a screenshot along with it
Build a 3-column pricing section: 3 tiers, monthly/yearly toggle, middle one highlighted
```

**What you will see:** it reads the source and writes a spec → builds native elements and classes → publishes once → screenshots the result → scores it against your design at every breakpoint → looks at the two side by side → fixes what is off → records the section. Then it stops. **One section per chat** is deliberate: a fresh chat is cheaper and more accurate than a long one.

More prompts, one per job → **the prompt library** in [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md).

---

# UPDATING THE PACK

```
cd <your clone>
git pull
```

Then in Claude Code:

```
Re-install the Webflow GOAT pack from <clone path> using the file table in README.md,
then run wf-doctor.js and wf-lint.js and show me the output.
```

Your per-site memory (`~/docs/memory/webflow/sites/<site-id>/`) is yours — an update keeps it. `CHANGELOG.md` says what changed.

**Three copies exist and none is the source of truth:** your live install (`~/.claude` + `~/CLAUDE.md` + `~/docs/memory/webflow`), your git clone, and any second clone you unzipped. Live is what the agent actually loads. Edit live, then push it into the clone:

```
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh           # check only, changes nothing
bash C:/Users/ME/docs/memory/webflow/scripts/wf-sync.sh --apply   # copy live -> repo
```

It never edits live and never commits — you review the diff and commit. A file changed in only one copy gets silently reverted by the next install. That has already happened once.

Pack files are **LF** line endings, enforced by `.gitattributes`, because `wf-lint` compares byte for byte. A CRLF checkout reports false drift on every file.

---

# QUICK FIXES

| Problem | Cause | Fix |
|---|---|---|
| Claude asks permission every few seconds | permissions not merged, or the rule is not the literal absolute path | C.4 |
| "designer_tool failed" / "bridge disconnected" | bridge app not launched, or the Designer tab went idle in the background | focus the tab. **Do not rebuild** — the writes already landed |
| Agent cannot see my site | site not approved during authorize, or wrong account | B.4, then `list my Webflow sites` |
| It built into the wrong page | the agent builds where **you** are looking | open the right page, say "rebuild here" |
| Everything works but nothing appears | you are on a different page or a branch in the Designer | check the page and branch |
| Screenshot source fails | no OCR | A.2 (Tesseract) |
| Chat crashed mid-page | progress is saved on disk | new chat → say **"resume"** |
| A section must go to the client's site | wrong path chosen before building | B.3 path 2, and `/portable on` **before** the build |

Full troubleshooting table → [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md).

---

**Next:** [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md) — the prompt library, copying sections between sites, changing the agent's rules, and every troubleshooting case. In-chat cheat sheet: type `/webflow-help`.
