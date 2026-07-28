# Webflow GOAT Agent — Backup v1.9.1

**Created:** 2026-07-18 (Mac) · **Cross-platform:** Windows / macOS / Linux — zero platform-specific paths anywhere in this pack.

Pixel-perfect, native-only Webflow build agent (Figma / screenshot / HTML / **live-site URL** → Webflow via MCP). Zero custom code.

**New user? Read `how-to-use.md` first** — commands, rules, quick answers on one page.

## What's inside → where it lives (`~` = home dir: `%USERPROFILE%` on Windows, `/Users/<you>` on Mac, `/home/<you>` on Linux)

| Backup path | Restore to | What it is |
|---|---|---|
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` (agent mode) — or its BODY (below the frontmatter) to `~/CLAUDE.md` (standalone mode) | THE agent brain, single source of truth: rules, workflow, batching, source routing, portable mode, "never" list |
| `CLAUDE.md` | repo/pack root only | Thin router pointing to the agent file — NOT the brain anymore (v1.2.0 dedup); do not restore as `~/CLAUDE.md` |
| `skills/*` | `~/.claude/skills/` | 15 lazy skills: design-intake (Figma/screenshot) · **html-intake (new v1.8.0)** · url-intake · figma-setup · build-reference · **webflow-platform (new v1.8.0)** · **component-build (new v1.8.0)** · **cms-build (new v1.8.0)** · motion-build · pixel-verify · responsive-pass · **portable-mode (new v1.8.0)** · session-recovery · custom-code-once · webflow-help |
| `how-to-use.md` | anywhere user-readable (also `~/docs/memory/webflow/`) | Human manual — never loaded by the agent during builds |
| `docs-memory/*` | `~/docs/memory/webflow/` | registry.md (fresh single-file template), pending_designer_work.md, impossible_cases.md, error_learnings.md (incl. merged v5 lessons), scripts: shot.js / shot-el.js / ref-extract.js / pixel-diff.js / motion-verify.js / **state-shot.js (new v1.7.0 — interaction-state shots for behaviour parity)** |
| `rules/webflow-core.md` | `~/.claude/rules/webflow/core.md` | 8-line GOAT router (replaces retired 85-line v5 orchestrator) |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | Platform routing — Webflow rows point to webflow-goat |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | Cross-session knowledge: MCP gotchas, SVG native path, CMS collection-list limits, pixel-match method, source-isolation policy, Encircle build notes |

After restore: `npm i ws pngjs pixelmatch --no-save` at `~` (screenshot/extract/pixel-diff scripts need them) + Google Chrome installed (scripts auto-detect: Windows `Program Files` path / Mac `Applications` path / Linux `google-chrome` on PATH).

## v1.9.1 changes (since v1.9.0) — post-release review fixes

A review of v1.9.0 found four real gaps. All four are closed here.

- **`<site-id>` was undefined.** Every rule said `sites/<site-id>/` but nothing said how to derive it, so a later session could invent a second folder and split one site's state in half. Now: match `build_state.site.site_id` against existing dirs first, else use the site's shortName/slug from `data_sites_tool`, seed from `sites/_template/`, and write `site.*` before any build work (agent § Memory, session-recovery step 0).
- **The repo still carried the pre-v1.9.0 layout** — the 263-byte stub registry, the un-scoped ledger, and six OLD script copies including the *permissive* `pixel-diff.js`. Restoring from this repo would have reinstalled the exact bugs v1.9.0 fixed. Removed; the 17 real outstanding Designer items are preserved at `docs-memory/sites/hive-pro-blog/`.
- **`wf-sync.sh` orphaned real site state.** It synced only the template, so a site's registry and pending ledger never reached the repo. It now carries the three state files for any site the repo already tracks; caches still never travel.
- **The lint baseline was stale** (frozen at the broken 7 errors / 9 warnings), so `--compare` measured against the past. Re-cut at **0 / 0** — any future regression now shows as new.
- **`webflow-help`** (the user cheat sheet) was a version behind: it now covers the three strict pixel conditions, the a11y/perf gate, the evidence rule, per-site state, and the two read-only health checks (`wf-lint.js`, `wf-sync.sh`).

Honest note: `hive-pro-blog` is an **inferred** site name — the migrated ledger carried no site attribution, so it was derived from the Blogs collection id. Its `build_state.json` records that warning; resolve the real site before acting on those items.

## v1.9.0 changes (since v1.8.2) — the evidence layer, built

The rules were sound; what they pointed at often did not exist, and several gates could be passed by prose. This release makes the gates fail-closed and gives them real files to stand on. No existing rule was weakened.

**State is per site** — `~/docs/memory/webflow/sites/<site-id>/{registry.md, build_state.json, pending_designer_work.md, figma-cache/, ref-cache/}`; shared `impossible_cases.md`, `error_learnings.md`, `scripts/`, `package.json` at the root. `build_state.json` (17 references) had never existed; `registry.md` was a 263-byte stub missing all 12 sections the rules grep, so the recipe library never matched and the custom-code whitelist had nothing to check. One global pending ledger held 17 items from a single 2026-07-03 build and permanently blocked "complete" on every other site — now impossible.

**Verification is fail-closed.** `pixel-diff.js` fails on three independent conditions, not one: global <97%, **height delta >2%** (a section 200px too tall used to PASS — the differ cropped it and printed a note), and **any 12×12 cell >25% mismatched** (a destroyed component used to PASS at 98.5% global). Resampling switched to area-average so type-heavy sections are not punished for noise. `pixel-diff.test.js` holds all five cases green.

**New scored gate: accessibility + performance** — `page-audit.js` (pixel-verify §1.9) in the same browser session: contrast, accessible names, keyboard reach, heading order, alt, image weight, DOM depth, Lottie weight, CLS, 44px touch targets. Its first run on a real published page found 7 genuine 3.86:1 contrast failures that every previous pixel-perfect pass had scored PASS.

**Loopholes closed:** reports must paste the tool's verbatim `EVIDENCE` block (a number in prose is not a measurement) · STALLED is illegal while a CRITICAL/MAJOR diff is open · LIGHT depth must show its qualifying checklist · `reference-not-run` needs the command, the error, and a retry through a local static server · `state-shot.js` reports unhovered interactive elements as `unverifiedStates` instead of ignoring them · snapshot required before any destructive call (there is no undo API) · T0 micro-edits get a shot, and a mobile shot when they touch layout · hybrid sources are legal once roles are declared · Rule 17 inference never overrides a source (no invented motion on a static design) · one verification re-publish allowed, capped at 2 per section.

**Infrastructure:** scripts moved to `$WF/scripts/` with an absolute root (relative paths silently degraded every gate to prose when run from another directory) and pinned deps via `npm install` — `--no-save` had already pruned `ws` once. New `wf-lint.js` validates that every file, registry section, skill and cross-reference the pack names actually exists (baseline 7 errors / 9 warnings → **0 / 0**), and `wf-sync.sh` keeps the live pack and this repo checksum-identical.

## v1.8.0 changes (since v1.7.1) — performance audit applied, accuracy gates untouched

Measured before/after (approx tokens of instructions loaded):

| Job | v1.7.1 | v1.8.0 |
|---|---|---|
| micro-edit ("make the CTA blue") | 28,261 | **7,257** |
| Figma section build | 28,261 | **21,905** (25,134 incl. platform on the session's first build) |
| HTML build with motion | 31,428 | **27,014** |
| debug one broken breakpoint | ~28,000 | **9,457** |

1. **TASK LANES table at the top of the agent** — T0 micro-edit (no skills; read-back proof + one snapshot) · T1 section (full pipeline) · T2 page/site · T3 debug (evidence first, only the owning skill) · T4 inspect/non-visual. Explicit escalation rule; explicit list of what never scales down (exact values, native-first, no-code-without-permission, real content, read-back evidence, pending log).
2. **`build-reference` split** → `build-reference` (what to build: node table, ladder + recipes, Figma→CSS mapping, longhand, variables, heuristics) + new **`webflow-platform`** (MCP 2.0.1 surface, style-tool limits, SVG asset flow + pre-flight, text-node gotcha, form gotchas, REST fallback, error codes, portability traps). Platform file loads on the first build of a session, on a tool error, or when SVG/forms/components/CMS/REST enter scope.
3. **`design-intake` split** → design-intake (Figma/screenshot) + new **`html-intake`** (the whole HTML behaviour contract, §C.0-C.6 labels preserved so every cross-reference still resolves). Enforces the source-isolation rule structurally instead of by instruction.
4. **pixel-verify property diff is now SPEC-DRIVEN**: three sets only — every property in the spec, the inheritance-risk set, the Webflow-trap set. Reading back 40 catalogue properties per class to confirm defaults is gone; the visual score remains the backstop and anything the heatmap flags is read back regardless.
5. **Single-publish rule made explicit**: one publish, one browser session, all published-page checks (typography + behaviour states + motion fingerprint + every breakpoint shot). A second publish for "the mobile shots" is called out as a process bug.
6. **Bug fixes:** wrong script paths (`docs/memory/shot-el.js` → `docs/memory/webflow/…`) in agent Phase 3, pixel-verify §0 and responsive-pass §6 · figma-cache root unified under `docs/memory/webflow/` · 6 stale rule-number citations replaced with rule NAMES (immune to renumbering) · **contradiction removed**: build-reference's old "replicate intent — approximation, not pixel copy" animation block (it fought the behaviour-parity rule and duplicated ~740 tokens of motion-build) is deleted and replaced with an exact-over-intent correction.
7. **New skills:** `component-build` (MCP 2.0.1 components/props/variants/slots — a repeated block costs ~4 calls instead of N subtree builds), `cms-build` (Collection List flow + verified hard limits promoted out of memory: colour field unbindable, one template per list, API items invisible on a stale canvas), `portable-mode` (makes the previously phantom `/portable on|off` real).
8. **Batching note added** for MCP 2.0.1: `query_elements` takes multiple queries, `set_settings` takes `operations[]` — a verify read-back is ONE call.

No gate was removed or softened: intake spec, native-module gate, ladder + permission, content, icons, effect manifest, behaviour parity, visual ≥97%, per-breakpoint score, pending ledger all unchanged.

## v1.7.1 changes (since v1.7.0) — native-first is enforced, code needs permission

1. **Code is never the first move and never the agent's decision.** Rule 4 now demands a written descent proof per effect (`T1: tried/why not · T2: recipe checked/why not · T3: panel feature checked + get_more_tools asked/why not`) before any html/css/js exists. No proof line = no code.
2. **T4 canvas/WebGL: eligible, not pre-authorized.** The old "standing authorization" is gone. The agent writes the proof, then ASKS the user for that specific effect (one batched message per section) and waits for an explicit yes. Silence / "do what's best" = build the native fallback and say so. Permission is per effect, per session — never inherited.
3. **`/custom-code-once` unchanged and still user-only** for anything outside the canvas set: the agent may state the path exists if asked, but never proposes, hints at, recommends, or self-invokes it, and never frames code as the faster route.
4. **Verification enforces it:** pixel-verify ban sweep FAILS a code hit with no manifest row, no registry entry, no descent proof, or no recorded verbatim user authorization; the NATIVE report line now prints the proof/permission and any asked-and-declined effects. §1.7 gains a `native-fallback` status; intake gains `awaiting-permission`.
5. **Source code is a spec, not a build plan** (design-intake §C): the reference's markup is re-mapped to native modules, its CSS to class values, its JS to T1/T2/T3 behaviour. "The reference did it in JS" is a routing instruction, never a licence to copy code.

## v1.7.0 changes (since v1.6.0) — HTML behaviour parity + MCP 2.0.1 compatibility

1. **New agent Rule 16 — HTML/URL reference is a BEHAVIOUR contract, not a layout picture.** The reference counts as "read" only after every file it pulls in is read end to end (markup + every local css/js + inline blocks + every CDN library), then the reference is RUN headless. Layout-only recreation is a FAIL, not a partial.
2. **design-intake §C rebuilt:** §C.0 mandatory full-source inventory/review · §C.2 grep table extended (cursor/mouse effects, preloaders + load sequences, reveal classes + IntersectionObserver, `animation-delay`/`direction`/`fill-mode`/`cubic-bezier`/`steps`, `prefers-reduced-motion`, autoplay video) · **§C.2b library sweep** (GSAP/ScrollTrigger, AOS/ScrollReveal/WOW, Swiper/Slick/Splide, Lenis/Locomotive, Lottie-web, three.js/particles, typed.js/Splitting/countUp, Isotope, jQuery toggles → native route each) · §C.5 exact timing capture (no house defaults unless the source is silent, tagged `derived`) · **§C.6 run the reference** (`file://` → computed CSS + state shots + motion fingerprint).
3. **New script `state-shot.js`** — one headless launch captures base + hover + focus + click + scrolled states of the same element, on a published URL *or* a local `file://` reference; writes per-state PNGs + a JSON index. Verified working (hover deltas measured in the expected regions).
4. **pixel-verify §1.8 BEHAVIOUR PARITY gate:** both sides captured in the same states, scored per state with `pixel-diff.js`; fails a dead hover (no base↔hover delta), a reveal that never fires, missing T2 pseudo-element children, a frozen canvas, wrong trigger, or CSS-tier timing off by >10%. New `BEHAVIOUR` line in the match report, hard gate alongside NATIVE/CONTENT/ICONS/EFFECTS.
5. **motion-build:** HTML-delivery source row (reference fingerprint via `file://`) + reference-parity verify gate (row-by-row trigger/props/duration/iteration/reduced-motion diff against the reference JSON).
6. **url-intake:** live URLs get the same behaviour bar — state shots + motion fingerprint are mandatory, effect sweep now runs the full §C.2 table plus the library sweep.
7. **MCP 2.0.1 compatibility (build-reference § MCP surface, verified 2026-07-28):** session preamble (`webflow_guide_tool` → explicit `site_id` → `data_agent_instructions_tool > search_instructions`, re-run per site switch) · exact breakpoint ids (xxl/xl/large/main/medium/small/tiny) · current element action names (`set_attributes`, `move_element`, `query_elements`, `data_element_settings_tool` set_tag/set_visibility/set_dom_id/get_bindable_sources, `set_display_name`) · **components/props/variants/slots are API-buildable now** → repeated block = component with props, not N copies; component work is no longer a Designer handoff · variable `custom_value` for `calc()`/`clamp()`/`color-mix()` · localization writes secondary locales only · `get_more_tools` before ever calling a capability missing · `data_whtml_builder` + scripts tool remain banned.
8. **Unchanged on purpose:** no GSAP injection ever, native-first ladder T1-T4, effect manifest contract, content/icon gates, one-publish-per-section batching, source isolation.

## v1.3.0 changes (since v1.2.0) — 99%+ accuracy upgrade (user hard rules)

1. **DONE redefined:** built section must be visually indistinguishable from the reference side-by-side at every breakpoint — user never has to say "force match"/"retry".
2. **Rule 1 RENDER IS GROUND TRUTH:** study reference PNG BEFORE building; spec must list JSON-hidden features (per-char gradients via `styleOverrideTable`, backdrop blur, layered shadows, overlaps, wrap points). New design-intake §R.
3. **Convergent verify, not capped:** fix passes continue while each closes ≥1 diff; stop only at zero visual diffs / documented impossible / 2 no-progress passes (STALLED report). Each pass re-checks only open diffs — no full re-verify loops.
4. **Quantified pixel score:** new `docs-memory/pixel-diff.js` (pngjs+pixelmatch, scale-normalized, AA-tolerant) — prints match % + worst regions; PASS ≥97%. Visual side-by-side now mandatory for EVERY section (v1.2.0 LIGHT-tier visual skip reverted; LIGHT now only reduces property-table depth).
5. **MCP FIRST (Rule 5):** Webflow MCP connector always over REST; REST only when MCP absent.
6. **NATIVE MODULE FIRST (Rule 4):** expanded node table (+List, Blockquote, YouTube, Lottie, Lightbox, Search, Map, background-video, native form inputs); div-imitation of an existing native module = ban-sweep FAIL.
7. **Memory-verified techniques promoted into skills:** gradient text via unprefixed `background-clip: text` on nested span (try first, Designer fallback); text leaf via `DOM` + `set_dom_config`; fixed v5-era `<details>` accordion contradiction in error_learnings.md.
8. **Extra dep:** `npm i pngjs pixelmatch --no-save` (home dir, next to `ws`).

## v1.2.0 changes (since v1.1.2) — token + time upgrade, zero accuracy loss

1. **Dedup:** `CLAUDE.md` is now a thin router; `agents/webflow-goat.md` is the single source of truth (~5K tokens/session saved when both were loaded).
2. **Compressed core + skills ~35-45%:** every rule stated once — detail lives in the skill that owns it (longhand → build-reference, fluid-base gate → responsive-pass, snapshot-font lie → pixel-verify). ALL verified gotchas kept verbatim in meaning.
3. **Tiered pixel-verify:** LIGHT (simple sections — structure + ban-sweep + 8-prop spot diff + 1 snapshot) / FULL (complex, section 1, heroes). LIGHT failure auto-escalates to FULL. ~50% verify cost saved on simple sections.
4. **Scoped figma-setup (new default):** fetch structure + variables + only in-scope sections; missing sections cache-on-fetch later. FULL prefetch only for whole-page/site builds.
5. **Batch discipline (hard targets/section):** 1 style batch · ≤2 builder calls · 1 fix batch per pass · 1 memory write pass.
6. **Fixed contradiction:** build-reference previously said `border-radius` shorthand "is OK" — corrected to match the verified rule: expand `gap` → `grid-column-gap`+`grid-row-gap` and `border-radius` → all 4 corner longhands.

## v1.1.2 changes (since v1.1.1)

1. **NEW SOURCE: live website URL as design reference** — skill `url-intake` + script `ref-extract.js` (headless-Chrome CDP walker: exact computed CSS per element, text, img srcs, bounding boxes, site's CSS variables; non-default values only; 800-node cap with per-section fallback). Figma-grade accuracy, zero vision guessing. Reference screenshots via shot-el.js per breakpoint; responsive values EXTRACTED at 991/767/478, never derived. All fetch-once in `docs/memory/webflow/ref-cache/{domain}/`. Third-party site → layout/patterns only, never their brand assets/copy.
2. **SOURCE ISOLATION (token/time):** one source = one intake skill + one cache. Figma builds never load url-intake/ref-cache; URL builds never load figma-setup/figma-cache/Figma MCP. Enforced in agent brain (Skills section + Phases 1–2) and skill descriptions.
3. **v5 system fully retired:** old 85-line orchestrator rules → 8-line router (~2K tokens saved every session); `webflow-kb/` removed (durable lessons merged into `error_learnings.md`); stale v3/v5 project state archived; single `registry.md` restored as the one registry format.
4. **`/custom-code-once` escape hatch:** custom code stays hard-banned; the ONLY exception is the user explicitly invoking this skill — native-answer-first, one confirmed snippet (scoped selector, no external scripts, IIFE-wrapped JS), logged in registry `## Custom-Code-Exceptions` + pending ledger, ban restores immediately. Agent may never suggest it. pixel-verify sweep whitelists only logged entries.
5. **User docs:** `how-to-use.md` manual + `/webflow-help` skill (cheat sheet on demand) — pure documentation, loads only when the user asks for help; zero token cost to builds.
6. **Cross-platform scripts:** shot.js / shot-el.js / ref-extract.js auto-detect OS (Chrome path, temp dir, ws resolution from home dir). No `C:\` paths anywhere in the pack.

## Known limits (native / MCP) — unchanged
- No IX2/interaction API in MCP → all motion is manual Designer work.
- Gradient-clipped text not settable via API → solid fallback + Designer finish.
- CSS rotation not native.
- ref-extract cannot see JS-driven hover/scroll animations or exact font files → Animation intake path / ask user.
See `docs-memory/impossible_cases.md` and `auto-memory/webflow-mcp-gotchas.md`.

## Restore
Copy each backup path to its "Restore to" location (table above), pick agent mode OR standalone CLAUDE.md mode, then `npm i ws --no-save` at `~`. Nothing else — no build step, no OS-specific config.
