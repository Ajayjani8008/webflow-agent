---
name: webflow-core
description: The Webflow GOAT operating rules and the fixed build pipeline. Load this before any Webflow build, rebuild or debug lane (T1/T2/T3) and before any MCP write. Owns the native-only ladder, the effect manifest, the evidence rules, the section pipeline and the batching targets. Not needed for micro-edits, audits or questions.
---

# Webflow Core — operating rules (v2.1)

**Priority: Fidelity (nothing simplified) > Native > Visible in Designer > Responsive-scored > Token economy.**
Reaching full fidelity first time IS the job. The user must never say "force match", "retry" or "you dropped the animation".

---

## A. THE SECTION PIPELINE — 11 calls, fixed order

Every T1 section runs this. Deviating costs turns, and turns are the whole cost. Steps 2/4/7/9 are single Bash calls into already-written scripts — never hand-assemble them from the individual tools.

| # | Step | Call |
|---|---|---|
| 0 | **Doctor, once per session** | `node "$WF/scripts/wf-doctor.js"` — scripts present, node deps resolvable FROM the scripts dir, Chrome, state root, and any section whose state is lying (in-progress with no recorded cost). Measured 2026-08-07: a build session spent calls on mid-flight `npm install`, `NODE_PATH=$(…)` prefixes and inline `sleep`. A half-working environment makes a gate look broken, and a gate that looks broken gets skipped. |
| 1 | **Resolve + lock target** | `node "$WF/scripts/wf-resolve.js" --site=<siteId> --page=<pageId> --section=<name>` — derives `<site-id>`, seeds state, locks page + section name, opens a turn budget. Blocks a build against an unlocked or mismatched page (this is what caused a whole section to be built twice on 2026-08-01). |
| 2 | **Intake → written spec** | `node "$WF/scripts/wf-section.js" intake …` (chains `figma-parse` → `figma-compile` → contract) or the source's intake skill for screenshot/HTML/URL. Output: `specs/<section>.md` + `specs/<section>.contract.json`. |
| 3 | **Look at the reference** | Open the reference render. **Mandatory, ~1.5k tokens, never skipped.** Then `ref-digest.js` for gradients/blur/overlap/wrap points you cannot see reliably. |
| 3b | **MEASURE the reference (v2.1)** | `node "$WF/scripts/text-extents.js" contract <ref.png> --bands=<label>:<y0>:<y1>,… --xoff=<N> --out=specs/<section>.extents.json` — turns the render into numbers **before** the build: true ink left/right/width per text line. Those numbers are what the build must hit. Tracking is then **solved**, never derived: `text-extents.js solve --target= --measured= --ls= --gaps=`. Skipping this is what cost the kush-header build four extra publishes (see § F). |
| 3c | **Cross-check the spec against the render — BLOCKING** | `node "$WF/scripts/text-extents.js" check-spec --measured=<px> --font-size=<px> --glyphs=<n> --ls=<px>[:<count>],…` — decomposes the measured ink into glyph advances + tracking. Exit 1 = the source's numbers are arithmetically impossible against the render, so **do not build from them**; solve instead. Needs no font metrics. On kush-header the shipped spec implied **−27.9px of glyph advance** in a 111px line: caught in one call, before any write. |
| 4 | **Preflight the plan** | `node "$WF/scripts/wf-preflight.js" <plan.json>` — validates every type, class, combo, longhand and skeleton BEFORE a single MCP write. Exit 1 = fix the plan, do not build. |
| 4b | **BUILD TOKEN — produce it or you are not building** | `node "$WF/scripts/wf-section.js" token --site=<dir> --section=<name> --source=figma\|url\|html`. Prints `BUILD-TOKEN` **only** when the site_id and page are locked, the spec and plan exist, preflight passes *right now*, and (url/html) the content inventory exists. **No `data_element_builder` or `data_style_tool` write is legal without a fresh BUILD-TOKEN line for this section in this session.** Measured 2026-08-07: a footer cost 68 calls and 57 minutes with **not one pipeline script run** — no resolve, no intake, no preflight, no record — hand-rolled with raw MCP and `node -e`, into a site with **no state dir at all**, borrowing another site's ref-cache. Every gate was advisory prose, and prose loses under context pressure. |
| 5 | **Build** | SVG upload batch → **ONE** `data_style_tool` batch → **≤2** `data_element_builder` calls (structure + T2 effect children together) → post-batch child-count check → **placeholder sweep BEFORE the publish**: one `query_elements` with a `text` filter per string in `skeletons.json > allPlaceholderStrings`, plus a fresh read-back of every node you set text on. A placeholder found after publishing costs a publish; found here it costs nothing. **The plan must list every node you will create** — preflight blocks `set_text` on `TextBlock` and every other known trap, but only for nodes the plan actually contains; children omitted from `tree` are unchecked. Verified 2026-08-07: nine panel titles omitted from the plan shipped as "This is some text inside of a div block." |
| 6 | **Publish** | Once — `wf-resolve.js --publish`. Publishes 1-2 are free; **#3+ is refused without `--cause="<a root cause not already recorded>"`**, and a repeat of a recorded cause is refused outright. If you cannot name a new root cause you are guessing, and a guess does not earn a publish. |
| 6b | **Content coverage — the gate no pixel score can replace** | `node "$WF/scripts/content-coverage.js" verify specs/<section>.inventory.json <published-url> --mode=replica|adapt`. **REPLICA requires 100% of the reference's strings.** Measured 2026-08-07: a header passed verify-section, dom-contract 46/46 and page-audit while carrying **1.4%** of its reference's 139 strings — every other gate compares the build against the agent's own spec, so content the agent decided to substitute is invisible to all of them. Mode comes from the user's words, never inference. |
| 6c | **plan-diff — the only gate that sees an OMISSION** | `node "$WF/scripts/plan-diff.js" verify specs/<section>.plan.json <published-url>` (also runs inside `wf-section verify`). Every other gate verifies what EXISTS: property equality checks the classes you made, the pixel score compares the region you captured, a11y walks the DOM you shipped. So a build that is a SUBSET of its plan passes all of them. Measured 2026-08-07: a 582-node plan shipped as 25 divs / 16 links — **2.7% of its classes, 1.4% of its strings** — with property equality and a11y green. Requires 100% of planned classes and strings on the page. |
| 7 | **Verify — one call** | `node "$WF/scripts/wf-section.js" verify …` (chains verify-section → dom-contract → plan-diff, and auto-discovers the reference shots). Direct: `node "$WF/scripts/verify-section.js" <url> "<sel>" <outDir> --section= --widths=1440,991,767,390 --ref= --audit --states=…` → every breakpoint shot, every score, a11y/perf, states, in ONE consolidated `EVIDENCE` block. Then `dom-contract.js verify` for property equality. |
| 8 | **Fix** | ONE batched call. Re-check only open items + 3-5 neighbours. |
| 9 | **Record** | `node "$WF/scripts/wf-section.js" record …` — build_state + registry + spec statuses in one write. It also runs `wf-report.js` and stores the section's **measured** cost (turns · calls · publishes · peak context · minutes) into `build_state.sections[].cost`. A budget nobody measures is a wish: report the `EVIDENCE wf-report` block verbatim whenever it says OVER BUDGET. |

Re-publish for verification is allowed once (cap 2/section, counted by `wf-resolve`). Publishing per artifact is the process bug.
**The loop is the cost (v2.1).** `wf-section verify` records verdict+score; a verify that reproduces the previous one closed nothing, and two of those prints **STALLED** — at which point the next step is a *measurement*, never another fix-and-publish. Measured on kush-header: 6 publishes and 4 verify runs against a budget of 15 calls, every one of them because the build targeted spec arithmetic instead of the render.
**T2:** one section per session. Finish → record → hand off: *"section done and recorded — start the next in a new session, it resumes from build_state."*

**Batching targets (hard):** classes ONE call · elements ≤2 · fix pass ONE per pass · memory ONE write pass. Over target → say why, then continue.

**The call floor is ~9, not ~14 — three measured sources of waste (v2.1):**
- **Load the MCP surface in ONE `ToolSearch`.** Fetch the standard Webflow set together (`webflow_guide_tool, data_agent_instructions_tool, data_sites_tool, data_pages_tool, data_element_tool, data_element_builder, data_element_settings_tool, data_style_tool, data_assets_tool, data_fonts_tool, element_snapshot_tool, designer_tool`) at the first build call of the session. Fetching them piecemeal cost 3-4 calls on kush-header.
- **Never call `list_assets` twice.** It returns every asset on the site — 75KB and over the response limit on a 100-asset site, spent twice to learn seven ids. Cache the map once: `wf-section.js assets --put="name=id,…"`, then `--get=` is free forever.
- **Predict native-module child ids, do not read them back.** `skeletons.json` records each module's created children in depth-first order and `webflow-platform` § ids gives the id-suffix sequence, so a Dropdown's Icon / label Block / 3 links are all derivable from the wrapper id. Read-then-remove-then-append is 3 calls; predicted removal is 1.

---

## B. Rules

**1. RENDER IS GROUND TRUTH — look before building.** JSON and computed values are measurements; the render is the truth. Open the reference and list what values hide: per-character gradients (Figma `styleOverrideTable`), backdrop blur, layered shadows, opacity stacks, overlaps, true wrap points. Verified case: flat JSON reported a per-char gradient H1 as solid white; only the PNG showed it.
**A global pixel percentage cannot see a small text run.** On kush-header an entire missing line ("OF FRAGRANCES", ~10px tall in a 1632×117 bar) scored **98.75% PASS with zero hot regions** — under the 3% budget and diluted across the 12×12 cell grid. The eye caught it in one view; the differ never would. So: the anchor view stays mandatory, and every text line the section owns gets a `text-extents` band (pixel-verify §1.4). **Δwidth is tracking, Δleft is position** — both are numbers you can fix from.
**Image cost is ~1,500 tokens, maximum, at any resolution** (Anthropic bills `(w×h)/750` after a 1568px-edge downscale). Earlier pack versions claimed 5k-66k and rationed looking — that was wrong by ~40× and it cost accuracy. Budget: reference render always · one anchor compare against the built shot at the primary width even on PASS · the diff PNG on any FAIL or UNSCORED width. Do not re-open a width that scored PASS — the measurement is stricter than the eye. That is 2-4 views per section, ~6k tokens, and it is the cheapest accuracy in the pack.

**2. EXACT VALUES — never guess.** Every property from the source, applied exactly. A value that exists but is unreadable (broken frame, missing asset, ambiguous binding) → ask. Design judgment the brief simply left open is **not** unknown — decide it at studio quality (Rule 17).

**3. CONVERGE, AND EVIDENCE NOT CLAIM.** pixel-verify after every section; side-by-side visual compare mandatory. Fix passes continue while each pass closes ≥1 diff; stop at zero visual diffs or a documented impossible case. Every score is the tool's own output pasted verbatim (`EVIDENCE verify-section` / `EVIDENCE dom-contract` / `EVIDENCE page-audit` / motion rows). **A source's derived numbers lose to the render (v2.1).** kush-header's spec carried per-span letter-spacing of `3.04px`/`13.28px`; applied as px they compute a 192px line where the render measures **111px**. Rule 1 means the render wins — measure the reference, then solve. Equally, a *structural* reading can be wrong: the spec's flex-column brand block sized to its widest child and centred the logo inside it, putting the whole block **+70px right**; the design's model is a logo-width box with the text lines overflowing it centred. Both were visible in the reference at intake and both cost a publish each.
**STALLED is illegal while any CRITICAL/MAJOR diff is open** — that is FAIL: keep working or rebuild. STALLED needs, per remaining diff: property/region, what both passes attempted, why it did not move, the artifact path, what would resolve it.

**4. NATIVE MODULE FIRST, THEN THE LADDER — descend, never simplify.** Check the native-module map before building any pattern (`build-reference` § Node types): gallery→Lightbox, accordion/menu→Dropdown, video→Video/YouTube, vector anim→Lottie, quote→Blockquote, lists→List, plus slider/tabs/navbar/form/grid. **A div-imitation of an existing native module is a ban-sweep FAIL** — `wf-preflight` blocks it.
Every effect takes the LOWEST tier that reproduces it exactly: **T1** style tool on a class (incl. `:hover`) → **T2** a real child element (this is how `::before`/`::after`, shapes, glows, gradient borders get built — Webflow has no pseudo-element control) → **T3** native Interactions panel, GSAP-powered, no code, emitted as a `[critical]` ledger build-script → **T4** contained code, eligible ONLY for the enumerated canvas/WebGL set.
"No Webflow control exists" means descend a tier, never drop the effect. Layout, spacing, typography, colour and hover in code = ban violation forever.
- **Code is never the first move and never the agent's call.** Written proof required per effect: `T1 tried/why not · T2 recipe checked/why not · T3 panel feature checked (+ get_more_tools asked if it looked like a missing capability)/why not`. Proof holding and effect inside the T4 set → **stop and ask the user**, one line, all of a section's asks in ONE message. Silence or "do what's best" = build the native fallback. Outside the T4 set the USER must invoke `/custom-code-once` themselves; never propose, hint at, or self-invoke it. Log every approved snippet with the exact authorization + date in registry `## Custom-Code-Exceptions`.
- Every CSS value → `data_style_tool` on a class. `xattr` = HTML semantics only (`id`, `href`, `alt`, `type`, `placeholder`, `role`, `aria-*`, CMS bindings).
- **Longhand only.** `gap` → `grid-column-gap` + `grid-row-gap`; `border-radius` → all four corners. Full table in `build-reference` § Longhand; enforced by `wf-preflight`.
- Batch the reads: `query_elements` takes multiple queries, `set_settings` takes `operations[]`. A verify read-back is ONE multi-query call — post-write and fresh, never cached.

**5. MCP FIRST, AND KNOW ITS CURRENT SURFACE.** MCP is the only path when present; REST only when the tools are absent, never mixed per call (REST cannot set class styles at all). **Preamble, in order:** `webflow_guide_tool` → explicit `site_id` → `data_agent_instructions_tool > search_instructions` for that site, read every hit → resolve page/branch. Re-run it on reconnect, site switch, or a changed tool list — not on a session counter.
Never claim a capability is missing from memory or a cached tool listing — `get_more_tools` with the category and a concrete brief settles it, logged once in `error_learnings.md` with the date.
**One MCP path, old spec or new — never branch on protocol version.** A read-back is evidence only if post-write and fresh (identical to the pre-edit read → re-issue with a different query shape). `InputRequiredResult` is not an error: retry the same tool with `inputResponses` — but if the question is one the rules reserve for the user (custom code, destructive op, publish, overwrite), surface it verbatim and WAIT. On a validation error re-read the tool schema instead of guessing. Task id handed back → store in `build_state.tasks[]`. Server-delivered MCP App HTML is client UI, never build output. Details: `webflow-platform` § MCP surface / § MCP protocol handling.

**6. BUILD WHERE THE USER IS.** `wf-resolve.js` locks site + page + branch and asserts the lock before the first write. Not visible in Designer → stop, page mismatch.

**7. RESPONSIVE IS PART OF THE BUILD, SCORED LIKE DESKTOP.** `responsive-pass` per section, every breakpoint before "done", touch targets ≥44px. **Hunt the mobile/tablet frames** in the source first (name patterns, widths 320-480 / 700-900, mobile page, variants) — found = exact values + score ≥97% against that frame; deriving while a frame exists is a failure. Spacing/gap/padding/margin/alignment get an explicit per-class diff at every breakpoint. **Fluid base first**: Figma fixed width is a canvas artifact — containers/cards/text get `width:100%` + `max-width:{n}px`; bare px only on intrinsic UI (icon, avatar, logo, fixed media).

**8. A11Y + PERF ARE PART OF DONE.** `page-audit.js` scores every section in the same browser session as the pixel shots (contrast · accessible name + keyboard reach · heading order · alt · image weight · DOM depth · Lottie weight · CLS · 44px touch). Fix natively at the owning tier — never by code, never by deleting the element. Unmeasurable contrast (text over gradient/image) is checked visually and reported as *checked*, never as passed.

**9. CRASH RECOVERY + NO IRREVERSIBLE MOVES.** `build_state.json` updated per section; resume from last verified. **Snapshot before destroying** anything you did not just create — `remove_element` on an existing subtree, "delete and rebuild native", `unregister_component`, section replace, `POST /dom`: `element_snapshot_tool` + a `snapshots[]` entry FIRST. No undo API exists.

**10. IMPOSSIBLE CASES.** Log to `impossible_cases.md` (shared) + this site's `pending_designer_work.md` with the native alternative. Never force. Never "complete" while THIS site has an open `[critical]` item for that section; another site's ledger is not this build's problem.

**11. PORTABLE MODE.** Default OFF (variables). `/portable on|off` or an intent phrase → load `portable-mode`. Accuracy is identical: literals must equal the resolved variable values exactly.

**12. MOTION = NATIVE INTERACTIONS, MEASURED NOT CLAIMED.** Webflow Interactions are natively GSAP-powered (timeline + ScrollTrigger + SplitText + staggers). **Never inject GSAP or any tween code** — the engine ships in the platform. Route through `motion-build`: one-pass reference read → Motion IR → lowest native tier → `motion-verify.js` proof (moved, zero jank props, timing, reduced-motion). Interactions have **no API** → emit an exact panel build-script, all of a page's in ONE handoff, and verify by measurement that it was applied. Grep `registry.md ## Motion-Recipes` first; learn the panel flavour once into `## Motion-Panel` and never invent field names.

**13. NOTHING SILENTLY OMITTED — the effect manifest is a contract.** Intake numbers EVERY effect (hover, transition, `::before`/`::after`, `@keyframes`, canvas, clip-path, filter, blend, scroll behaviour) as `E1…En` with a tier. Each row ends the section as `built` / `interactions-queued` / `code-tier` / `impossible+alternative`. "Simplified", "close enough", "skipped for now" are not statuses. Never redesign, re-word, re-order or drop anything the user did not ask to change.

**14. REAL CONTENT ONLY.** Every string, image, icon and alt from the source, verbatim. Zero lorem, zero `This is some text inside of a div block`, zero stock substitutes, zero invented microcopy, zero truncation. Placeholder only where explicitly authorized, logged.

**15. ICONS/SVG MUST SURVIVE THE BUILD.** Pre-flight before upload (viewBox, baked colours, no `<style>`/`<script>`/external `<use>`, unique internal ids) → bind by **asset id**, never `src` → explicit class size + `flex-shrink: 0` in flex rows → verify rendered box non-zero at every breakpoint and count == reference. A broken icon fails the section at 99% pixel score.

**16. HTML/URL REFERENCE = A BEHAVIOUR CONTRACT.** Only "read" once every file it pulls in has been read end to end — markup, every local stylesheet and script, inline blocks, every CDN library. Then **run it** headless for state shots + a motion fingerprint with exact durations, delays, easing, iteration counts and thresholds. Libraries route natively (GSAP/AOS→Interactions, Swiper→native Slider, Lottie-web→Lottie, three/particles→T4), never re-injected, never dropped. Verification is per state: a dead hover, a reveal that never fires, a frozen canvas or timing off by >10% fails the section even at a perfect resting score. Unrunnable → say so with the command and the error, mark `reference-not-run`, verify the manifest on the built side.

**17. BUILD THE BEST VERSION, NEVER THE TOY VERSION.** "Build X" means what a senior Webflow studio ships for X. A gap in the *brief* is yours to fill with the strongest professional interpretation — never a stub, never a question that stalls the build. **ASSUME → STATE in one line → BUILD.** Ambition is depth, not scope: deepen exactly what was asked, never add sections or features nobody asked for. "Make it premium" is a demand for a stronger *native* build, never permission for code.
**Precedence: explicit user instruction > the source > Rule 17 inference > house defaults.** On a design source, ambition = fidelity, completeness and depth *of that design* — **not motion the design does not have**. Inventing a reveal or parallax on a static frame is scope creep.
**Toy tells = FAIL:** a lone linear opacity fade standing in for a reveal · one duration reused everywhere · no stagger on a list/grid · default `ease` where the motion implies a curve · hover that only swaps a colour · no scroll threshold · flat treatment where the reference has depth · "simple version" / "placeholder for now" / "can be enhanced later" in any status line.

---

## C. Source routing — one source, one intake path

| Source | Path |
|---|---|
| Figma, first time | `figma-setup` (scoped) → build from `figma-cache/` |
| Figma, cached | `figma-cache/` → instant. A second fetch of a cached node is a bug |
| Screenshot | `design-intake` §B for the render study, then **`wf-section intake --screenshot=<png>`** → `shot-compile`: OCR gives every string **with its box**, pixels give text colour, page background, gaps and filled-button detection, and it writes the content inventory itself. **No hand work.** Two honest limits, printed on every run: font FAMILY is unknowable (`--font` names the substitute) and font SIZE is a cap-height estimate ±1px, so **step 3c `text-extents check-spec` is mandatory for this source**; and a still has no states, so behaviour parity needs a URL/HTML reference or a recording — never claimed from an image |
| HTML delivery | `html-intake` — every html/css/js read end to end, run headless, manifest with exact timings |
| Live URL | `url-intake` → `ref-cache/{domain}/`. Third-party → layout/patterns only, never brand assets or copy |
| **React / Vue / SPA / Storybook** (localhost or deployed) | it is a live URL: `url-intake` → `ref-extract` (waits for hydration) → the SAME `--extract` intake. Hashed/utility class names are expected and handled — class identity comes from role + style fingerprint, never the framework's generated names |
| Text description | draft spec → confirm → build |
| Animation | `motion-build` → Motion IR → native tier route → `motion-verify.js` proof |
| Cross-site reuse | `portable-mode` (confirm once) |

Never load the other source's skill or cache for the same job. **Hybrid is legal but declared:** name the roles once in the spec (`primary=figma <node> (layout/content/values) · secondary=url <domain> (behaviour only)`), separate caches, every value tagged, conflicts resolved by the primary.

**Repeats:** a block repeating ≥2× non-editorial → `component-build` (one component + props, never N copied subtrees) · ≥3× editorial → `cms-build` (native Collection List + bindings). Decide at intake.

## D. Classes & variables

BEM kebab-case: `block`, `block__element`, `block__element--modifier`. Reuse > new.
**The block prefix comes from the SITE or the SECTION ROLE — never from the source file.** A Figma file name, page name or cache key is an accident of where the design happened to live; baking it into the class system leaves the client with classes named after a file that may be renamed tomorrow. Derive it from `build_state.site.id` (or the section role) and match the prefix the site already uses — grep `registry.md` first. Verified failure: a header + hero shipped 48 classes prefixed `kush-` from the Figma file "Kush - Figma To HTML" onto a site called `new-hive-pro-design` that already used `hc-*` and `ns*`. Renaming is safe (`rename_style` keeps styles applied) but it cost 48 calls that never needed to happen.
**Enforced, not just written (v2.1):** pass the resolved site id and the site's existing prefixes to preflight — `wf-preflight.js <plan.json> --site-prefix=<build_state.site.id> --known-prefixes=<from registry.md>`. It accepts the full site id, any leading run of its initials (`nh`, `nhp`, `nhpd`) and any whole word of 3+ characters, and **blocks anything else**. Omit the flags and the check is simply off, so always pass them.
Variable families `--color-*`, `--space-*` (4→192), `--font-size-*` (12→72), `--radius-*`, `--duration-*`/`--easing-*`.
Dedup: colour ±15/channel, spacing ±10%, else a NEW exact-value variable — never round >10%. Portable mode → raw values.

## E. Never (judgment calls — the machine-checkable ones are enforced by `wf-preflight` and `wf-lint`)

`data_whtml_builder` · hardcoded HTML · `<style>` · style-via-attributes · CSS in the Custom Properties panel ·
code for layout/spacing/typography/colour/hover · guessing a value the source carries · building before looking at the render ·
REST when MCP is available · wrong page/branch · skipping pixel-verify or its visual compare · declaring done with visible diffs ·
dropping, simplifying or approximating any source effect · replacing a canvas animation with an image lookalike ·
deriving mobile values when a mobile frame exists · skipping responsive-pass or its per-breakpoint score ·
"complete" with pending `[critical]` items · building section 2 before section 1 is verified ·
building from an HTML/URL reference after reading only the markup · shipping layout parity with dead behaviour ·
re-injecting the reference's animation library instead of the native route ·
claiming an MCP capability is missing without asking `get_more_tools` · passing a gate on a stale read-back ·
auto-answering an `InputRequiredResult` that asks for user permission · pasting MCP App HTML into the build ·
writing an ad-hoc `node -e` one-liner against a cache or capture (if a named script cannot answer it, add a FLAG to that script — a one-liner is thrown away and paid for again next session; 7 of them queried one file the compiler reads in a single call) · auditing or refactoring the PACK inside a build session (18 of 68 calls in the 2026-08-07 footer session were `git log`, file-size censuses and skills token estimates — maintenance belongs in its own session) · starting a build whose previous section is still `in-progress` with no recorded cost · shipping the toy version of an under-specified brief · substituting a reference's content when the user asked for a replica · offering the user a choice whose every option abandons the reference · asking the user to spec what you can infer ·
treating "make it premium" as permission for code · reporting a score without the verbatim `EVIDENCE` block · calling a section verified when nothing was scored (a missing `--ref` is now a FAIL, and an UNSCORED width must be DECLARED with `--unscored-ok`/`--unscored-reason` per Rule G — "PASS (not scored)" was printable before v2.1.11 and that is how a 1.4% header shipped) ·
calling STALLED with a CRITICAL/MAJOR diff open · waiving the behaviour gate with a bare "it wouldn't run" ·
ignoring `unverifiedStates` · destroying without a snapshot · inventing motion a design source does not have ·
surfacing another site's pending items · writing any code without a written descent proof AND a user yes ·
proposing or self-invoking `/custom-code-once` · reusing a past permission · starting from the reference's DOM instead of the native module map.

Run `node "$WF/scripts/wf-lint.js"` after any pack edit. Run `node "$WF/scripts/wf-preflight.js" <plan.json>` before any build.

---

## G. The two limits that are real — never report around them

**1. No mobile/tablet frame in the source.** No tool can score against a reference that does not exist. When the hunt (design-intake §A.8 / url-intake / html-intake) genuinely finds none:
- say **UNSCORED**, name the widths, and never let a derived value be reported as a matched one;
- derive deterministically instead of ad-hoc — same breakpoint transforms every time (fluid base, stack order, gap scale), recorded in the spec so the next section matches this one;
- still enforce the **invariants**, which need no reference: zero horizontal overflow · touch targets ≥44px · no clipped or blank text band (`text-extents bands`) · a11y/perf budgets (`page-audit`) · proportional spacing rhythm. Invariants are not a pixel score and must never be printed as one;
- the only real fix is asking for the frames. Say so once, plainly, and move on.

**2. Interactions have no API.** Confirmed repeatedly: `designer_tool` exposes zero interaction actions and the registry returns the full tool list for INTERACTIONS. So motion is always a Designer handoff. What that must never become is an unverified claim:
- emit the panel build-script for the whole page in ONE handoff, exact field names from `registry.md ## Motion-Panel`;
- log it `[critical]` in `pending_designer_work.md`;
- **a section does not close on an unapplied script** — `motion-verify.js` must measure the animation actually running (moved, timing within 10%, zero jank props, reduced-motion honoured) before the row flips from `interactions-queued` to `built`.

---

## F. What the kush-header build actually cost (2026-08-01) — read this before the next section

Measured from the transcript, not estimated. Section: one header, one 1920 reference frame, all assets already uploaded.

| | 2026-07-31 (v1.11.0) | 2026-08-01 (v2.0) | v2.1 target |
|---|---|---|---|
| assistant turns | 235 | 145 | ≤25 |
| tool calls | 107 | 68 | ≤15 |
| context re-read | 72.5M | 48M | — |
| publishes | 3 | **6** | 2 |
| wall clock | 51 min | 62 min | ~10 min |

v2.0's instruction split worked (always-injected 11,700 → 958 tokens) and every gate fired correctly: preflight blocked three real blockers before a single MCP write, the page lock caught a section that was recorded as built but absent, the overflow / touch-target / CLS gates all caught real defects. **What v2.0 did not fix is the loop**, and the loop is now the entire remaining cost.

**Where the 6 publishes went — every one avoidable at intake:**

1. build → verify (correct, free)
2. batched fix: overflow at 4 widths, tablet/mobile layout, 44px touch targets (correct, free)
3. brand sub-line clipped out of the bar — a flex gap applied between *all* children where the design has 10px above and 0px below
4. word gap re-derived from the spec instead of measured — made it worse (98.72 → 98.66)
5. brand block model wrong: a flex column sizes to its widest child and centred the logo inside it, **+70px right**. The design's model is a logo-width box with the text lines overflowing it, centred
6. letter-spacing finally *solved* from a measured ink width (111px) instead of the spec's arithmetic (192px)

**3, 4, 5 and 6 are one root cause: the build targeted the spec's numbers instead of the render's.** All four were measurable from the reference PNG at intake, with zero Webflow calls and zero publishes. Hence step 3b and the `--cause` gate.

**The other lesson, and it is the expensive one:** at publish 2 the section scored **98.75% PASS, zero hot regions, a11y PASS, and `dom-contract` 158/158 property-equality PASS — with an entire text line missing.** Every automated gate was green. Only the mandatory anchor eye-view caught it. A percentage cannot see a 10px run, and property equality cannot see an element that renders empty. Keep the view; add the band.

---

## H. ASK ALMOST NEVER — deciding is the job (v2.1.13)

The user hired the agent to turn a reference into Webflow. **Every question that the reference already answers
is the agent handing its job back.** Measured cost of getting this wrong: a header build asked which content to
use and then built 1.4% of its reference, because the menu it offered contained no option that meant "the
reference".

**In REPLICA mode the reference IS the answer.** Content, structure, depth, order, colour, type, spacing,
breakpoint behaviour, how many panels, which items — all of it is IN the source. Asking is a process failure.
**In ADAPT mode** the user's content is the answer for content only; every design decision is still the agent's.

**The complete list of things worth interrupting a human for. Nothing else qualifies:**

| Ask | Why it is genuinely theirs |
|---|---|
| Destroying or overwriting something the agent did not create — `remove_element` on an existing subtree, `unregister_component`, replacing a section, `POST /dom` | irreversible, no undo API, and it is their work |
| Custom code (`html/css/js`) after the written `T1→T2→T3` descent proof | standing user rule; changes what the site is made of |
| Publishing to a **production custom domain** | it goes live to their visitors |
| A credential, token or paid external service | their money, their security |

**CMS is INFORM, not ask.** Creating a collection, a field, or items to make the reference work is part of the
build: say in one line what was created and carry on. Only *deleting* or *overwriting* existing CMS data is an ask.

**Everything else: DECIDE → STATE IN ONE LINE → CONTINUE.** A missing value the source does not carry is a
studio-quality judgement call, not a question: pick what a senior Webflow studio would ship, write it in the
spec with `assumed:` next to it, and keep building. If the assumption turns out wrong the user says so, and one
targeted fix is far cheaper than a stalled build.

**Never ask a question whose options all abandon the reference.** If drafting a question produces no option
meaning "match the reference exactly", the question itself is the bug.

---

## I. Command shape — so the user stops approving every call (v2.1.13)

A permission rule matches a **literal prefix**. `Bash(node /abs/path/to/scripts/*)` covers the entire pipeline
in ONE rule — but only if the command starts that way. These all MISS it and each one costs the user a prompt:

    cd $WF/scripts && node wf-doctor.js          # compound: the rule sees `cd`
    WF=~/docs/...; node $WF/scripts/wf-lint.js   # variable: no literal prefix
    node ~/docs/memory/webflow/scripts/wf-lint.js   # tilde is not the literal path

**So: invoke every pack script as one command, absolute path, nothing before it.**

    node /Users/<you>/docs/memory/webflow/scripts/wf-doctor.js
    node /Users/<you>/docs/memory/webflow/scripts/wf-section.js intake --site=… --section=…

Resolve the absolute scripts path ONCE per session (`wf-doctor` prints it) and reuse it verbatim. Batch shell
work into single calls for the same reason: 40 Bash calls is 40 approvals, and the user cannot see what any of
them is for. One call that does the whole step, with its purpose in the message, is respectful of their time.
