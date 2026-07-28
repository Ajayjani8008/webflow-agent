# Webflow GOAT — Router (v1.8.0)

ALL Webflow work — any size, any source — is handled by the **webflow-goat** agent (`agents/webflow-goat.md`) or done inline following its rules. Single source of truth = the agent file; this router adds nothing.

- **Lane first (v1.8.0):** T0 micro-edit (no skills, read-back proof) · T1 section · T2 page/site · T3 debug · T4 inspect — see agent § TASK LANES. Skills load per lane, never by habit.
- End-to-end inline: render-first intake → native-module build → pixel-verify (zero visual diffs, ≥97% pixel score, content/icon/effect gates) → responsive-pass (scored per breakpoint) → motion (when in scope). MCP always over REST.
- **Code is never the agent's call:** strict T1→T2→T3 descent with a written why-not proof, then an explicit per-effect user YES before any html/css/js. Canvas/WebGL is eligible, not pre-authorized; no answer = native fallback. `/custom-code-once` = user-invoked only, never proposed or self-invoked.
- Effect Fidelity Ladder, never "out of scope": T1 class styles → T2 real child element (`::before`/`::after`, shapes) → T3 native Interactions panel / Lottie → T4 contained code (canvas/WebGL only, logged).
- Animation → `motion-build`: Motion IR → native tier route → build/handoff → `motion-verify.js` proof. Webflow Interactions are natively GSAP-powered (timeline, ScrollTrigger, SplitText, staggers — no code) and have NO API, so they ship as exact panel build-scripts. **Never inject GSAP or tween code.**
- HTML/live-URL reference = **behaviour contract**: every css/js file read end to end, libraries routed natively (GSAP/AOS→Interactions, Swiper→slider, Lottie-web→Lottie, three/particles→T4), the reference RUN headless (`state-shot.js` + `motion-verify.js`) for hover/scroll/load parity scored per state in pixel-verify §1.8. Layout-only match = FAIL.
- MCP preamble once per session: `webflow_guide_tool` → explicit `site_id` → `data_agent_instructions_tool > search_instructions` (site-owned rules layer under the agent's). Components/props/variants/slots are API-buildable — repeated block = component with props, never N copies. Capability gaps confirmed via `get_more_tools`, never from memory.
- 15 skills, lazy, source-isolated: design-intake (Figma/screenshot) · html-intake (HTML) · url-intake (live URL) · figma-setup · build-reference (what to build) · webflow-platform (MCP surface/limits/errors, on demand) · component-build · cms-build · motion-build · pixel-verify · responsive-pass · portable-mode · session-recovery · custom-code-once (user-only) · webflow-help.
- Project memory: `docs/memory/webflow/` — registry.md (incl. `## Motion-Panel`, `## Motion-Recipes`) · build_state.json · pending_designer_work.md · impossible_cases.md · error_learnings.md.
- Never: code for layout/spacing/type/color/hover, CSS shorthands, guessing values, placeholder content, broken icons, dropped effects, skipping verify.

Read `agents/webflow-goat.md` for all rules, workflow, and routing.
