# Webflow GOAT Agent — Backup v1.7.1

**Created:** 2026-07-18 (Mac) · **Cross-platform:** Windows / macOS / Linux — zero platform-specific paths anywhere in this pack.

Pixel-perfect, native-only Webflow build agent (Figma / screenshot / HTML / **live-site URL** → Webflow via MCP). Zero custom code.

**New user? Read `how-to-use.md` first** — commands, rules, quick answers on one page.

## What's inside → where it lives (`~` = home dir: `%USERPROFILE%` on Windows, `/Users/<you>` on Mac, `/home/<you>` on Linux)

| Backup path | Restore to | What it is |
|---|---|---|
| `agents/webflow-goat.md` | `~/.claude/agents/webflow/` (agent mode) — or its BODY (below the frontmatter) to `~/CLAUDE.md` (standalone mode) | THE agent brain, single source of truth: rules, workflow, batching, source routing, portable mode, "never" list |
| `CLAUDE.md` | repo/pack root only | Thin router pointing to the agent file — NOT the brain anymore (v1.2.0 dedup); do not restore as `~/CLAUDE.md` |
| `skills/*` | `~/.claude/skills/` | 9 lazy skills: build-reference, design-intake, figma-setup, pixel-verify, responsive-pass, session-recovery, **url-intake (new)**, **custom-code-once (new)**, **webflow-help (new)** |
| `how-to-use.md` | anywhere user-readable (also `~/docs/memory/webflow/`) | Human manual — never loaded by the agent during builds |
| `docs-memory/*` | `~/docs/memory/webflow/` | registry.md (fresh single-file template), pending_designer_work.md, impossible_cases.md, error_learnings.md (incl. merged v5 lessons), scripts: shot.js / shot-el.js / ref-extract.js / pixel-diff.js / motion-verify.js / **state-shot.js (new v1.7.0 — interaction-state shots for behaviour parity)** |
| `rules/webflow-core.md` | `~/.claude/rules/webflow/core.md` | 8-line GOAT router (replaces retired 85-line v5 orchestrator) |
| `rules/common-agents.md` | `~/.claude/rules/common/agents.md` | Platform routing — Webflow rows point to webflow-goat |
| `auto-memory/*` | `~/.claude/projects/<project-slug>/memory/` | Cross-session knowledge: MCP gotchas, SVG native path, CMS collection-list limits, pixel-match method, source-isolation policy, Encircle build notes |

After restore: `npm i ws pngjs pixelmatch --no-save` at `~` (screenshot/extract/pixel-diff scripts need them) + Google Chrome installed (scripts auto-detect: Windows `Program Files` path / Mac `Applications` path / Linux `google-chrome` on PATH).

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
