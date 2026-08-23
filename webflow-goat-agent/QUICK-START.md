# Webflow GOAT — Quick Start (5 minutes)

You give a design. Claude builds it in your real Webflow site. Native elements only, no custom code, and it proves the result matches the design before it says "done".

Never used this before? Read this page. Want every detail → [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md).

---

## 1. What it does for you

- Turn a **Figma frame**, a **screenshot**, an **HTML/CSS folder**, a **live website URL**, or just a **written idea** into a real Webflow section or page.
- Builds with **real Webflow elements and classes** — no embed blocks, no pasted code.
- **Checks its own work.** Takes a screenshot of what it built, compares it to your design, and only calls it done at **99%+ match** on every screen size.
- Writes down what it built, so a new chat can continue where the last one stopped.

## 2. What you need first

| Need | Why | Have it? |
|---|---|---|
| **Claude Pro** (or Max) | runs the agent | claude.ai → subscribe |
| **Claude Code** | the agent lives in the terminal / desktop app, not in the web chat | `npm i -g @anthropic-ai/claude-code` |
| **Webflow account + a site you can edit** | it writes into your real site | webflow.com |
| **Webflow connector turned on in Claude** | how Claude touches Webflow | claude.ai → Settings → Connectors → Webflow → Connect |
| **Node.js** (any current LTS) | runs the checking scripts | nodejs.org |
| **Google Chrome** | takes the screenshots used for scoring | google.com/chrome |
| *Figma token* | only if you build from Figma | optional |
| *tesseract* | only if you build from screenshots, and only on Windows/Linux | optional |

## 3. Install — let Claude do it

Download or clone the pack, then open **Claude Code** and paste this. Change the path to your folder.

```
Install the Webflow GOAT agent pack for me.

Pack folder: C:\Users\ME\Downloads\webflow-agent-main\webflow-goat-agent

Do this:
1. Read BACKUP-README.md in that folder.
2. Copy every file to the exact destination its table says.
3. Run: npm install   (inside ~/docs/memory/webflow/scripts)
4. Run wf-doctor.js and wf-lint.js and show me the raw output.
5. For settings-permissions.json: do NOT edit my settings yourself.
   Print the exact JSON block and tell me which file to paste it into.
```

Then finish the one thing Claude is not allowed to do for itself:

```
/update-config
```
and say: *"merge the permissions from settings-permissions.json into my settings, replace `<SCRIPTS>` with my real absolute scripts path, and keep both slash directions on Windows."*

Skipping this step is the #1 reason the agent feels slow — every check asks you to approve it.

**Prefer to do it by hand?** The file-by-file table is in `BACKUP-README.md`.

## 4. First build

1. Open the **Webflow Designer** on the page you want. The agent builds **where you are looking**.
2. In Claude Code, say it plainly:

```
Build the hero section on this page from this Figma: <figma-url>
```

Other sources, same shape:

```
Build the home page hero like this site: https://example.com
Build this section from the HTML in ./delivery/hero/
Build this   ← paste a screenshot with it
Build a 3-column pricing section: 3 tiers, monthly/yearly toggle, middle one highlighted
```

That's it. It reads the source, builds, screenshots, scores, fixes, and reports.

## 5. Five things to know

1. **One section per chat.** Big page = several chats. It saves progress and picks up on "resume".
2. **It decides, it does not interview you.** It only stops for: deleting something it didn't make, custom code, publishing to your live domain, or anything needing your password or money.
3. **No custom code, ever** — unless *you* type `/custom-code-once`. The agent will never ask for it.
4. **Some things Webflow only allows in the Designer by hand** (scroll animations, slider setup, Symbols). Those go on a to-do list at `sites/<your-site>/pending_designer_work.md`. It will say "partial", never fake "done".
5. **Every number it reports is copied from a tool.** No proof block = not measured. Ask for the proof.

## 6. When something looks wrong

| Symptom | Fix |
|---|---|
| Wrong page got built | You were on another page in the Designer. Open the right one, say "rebuild here". |
| Approving a prompt every few seconds | Permissions not merged → step 3. |
| "Designer disconnected" mid-build | Usually just a background browser tab going idle. **Do not ask for a rebuild** — that builds the section twice. Focus the tab. |
| Small edit feels slow | Say "T0" or "just change it". |
| Chat crashed | New chat → say "resume". |

## 7. Where your stuff lives

```
~/docs/memory/webflow/
├── scripts/                       the checking tools
├── error_learnings.md             lessons from past mistakes
├── impossible_cases.md            what Webflow simply cannot do natively
└── sites/<your-site-id>/
    ├── specs/<section>.md         what it read from your design = the contract
    ├── registry.md                classes, variables, pages
    ├── build_state.json           progress + scores (the resume point)
    └── pending_designer_work.md   YOUR manual to-do list
```

## 8. Health check any time

Paste the **absolute path**, one command, nothing before it:

```
node C:/Users/ME/docs/memory/webflow/scripts/wf-doctor.js
node C:/Users/ME/docs/memory/webflow/scripts/wf-lint.js
```

`wf-doctor` = is my setup sane. `wf-lint` = is the pack itself intact. Both should come back clean.

---

Need more? → [`HOW-TO-USE-AGENT.md`](HOW-TO-USE-AGENT.md) · install/restore detail → `BACKUP-README.md` · version history → `CHANGELOG.md`
