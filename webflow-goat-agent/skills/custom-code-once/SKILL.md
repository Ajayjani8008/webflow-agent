---
name: custom-code-once
description: ONE-TIME user-authorized exception to the Webflow custom-code ban. Load ONLY when the USER explicitly invokes /custom-code-once or explicitly demands custom JS/CSS after being told the native answer. The agent must NEVER suggest, propose, or self-invoke this skill — user demand is the only trigger.
---

# Custom Code — One-Time Exception

The GOAT code ban (Rule 4) stays the default forever. This skill is the narrow, user-controlled exception for anything **outside** the ladder's T4 set. It exists so a hard user requirement doesn't dead-end — not to soften the ban.

**Not this skill's job:** effects that already have a tier on the Effect Fidelity Ladder (build-reference). `::before`/`::after`, shapes/clip-path, `@keyframes`, hover — those are T1/T2/T3 native builds; reaching for code there is a violation, not an exception. Canvas/JS-driven animation is T4 under the user's standing "preserve the HTML effects" instruction — build it per the ladder's containment rules and log it, no invocation needed. Everything else (custom CSS hacks, third-party scripts, JS to fake a native module) still requires the protocol below.

## Trigger — user only, never agent

Valid ONLY when the user explicitly says so THIS session: `/custom-code-once`, "add custom JS/CSS anyway", "I know it's banned — do it", or equal force. NOT valid triggers: a design element that "seems to need" code, agent convenience, a previous session's permission, "while we're at it". **The agent proposing this skill = Rule 3 violation.** One invocation = one snippet on one element/page. Next time = new explicit invocation.

## Protocol (all 5 steps, in order — skipping any = ban violation)

1. **Native answer first (mandatory).** Before writing any code: state the native way to achieve the effect (element settings / class styles / IX2 / `:hover`+transition), or cite the matching `impossible_cases.md` entry proving no native way exists. If a native way EXISTS, say it and its cost — the user may still insist; their call, but they decide informed.
2. **Confirm scope in one line and get explicit YES:**
   *"ONE-TIME custom code: [what] via [html-embed / page-head CSS / page-footer JS] on [page/element]. Won't be editable in the Style panel, may not survive cross-site paste, excluded from pixel-verify native sweep. Ban restores immediately after. Proceed?"*
   No YES → stop, ban intact.
3. **Write the minimum code, safely:**
   - Smallest possible snippet, scoped to ONE unique class/id — never bare `div`, `body`, `*`, or a shared class (leaks onto other elements).
   - No external `<script src>`/CDN, no libraries, no trackers, no `document.write`, no global namespace pollution (wrap JS in an IIFE), no `!important` unless overriding Webflow's own inline style.
   - CSS → page-level custom code or embed with a scoped selector; JS → before-`</body>` page code, feature-detected, must not throw if its target is missing (guard `if (el)`).
   - The rest of the section stays 100% native — the exception covers ONLY this snippet, not the build style around it.
4. **Log it (both, immediately):**
   - registry.md `## Custom-Code-Exceptions`: `- [date] [page/element] [css|js] — what it does, why native couldn't, user-authorized via /custom-code-once`
   - pending_designer_work.md: `- [ ] [custom-code-once] [date] [page] — review snippet [name]; replace with native if Webflow ships support`
5. **Restore the ban — automatically, silently, immediately.** After the snippet lands and is verified working: the exception is CLOSED. Any further custom code — even one more line, even "fixing" this snippet — requires a fresh user invocation. pixel-verify's ban sweep: the logged exception is the ONLY allowed hit; anything else = failed build as usual.

## What this never becomes

- Not a mode. There is no "custom-code session". One snippet, then ban.
- Not a shortcut. If pixel-verify fails on the native build, the fix is native — never "patch it with CSS".
- Not transferable. Portable mode, cloneables, other pages, other sections: ban applies fully.
- Not silent. An unlogged exception = treated as a ban violation even though the user approved it.
