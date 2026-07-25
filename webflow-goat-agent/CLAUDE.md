# Webflow GOAT — Router (v1.5.0)

ALL Webflow work — any size, any source — is handled by the **webflow-goat** agent (`agents/webflow-goat.md`) or done inline following its rules. Single source of truth = the agent file; this router adds nothing.

- End-to-end inline: render-first intake → native-module build → pixel-verify (zero visual diffs, ≥97% pixel score, content/icon/effect gates) → responsive-pass (scored per breakpoint) → motion (when in scope). MCP always over REST.
- Effect Fidelity Ladder, never "out of scope": T1 class styles → T2 real child element (`::before`/`::after`, shapes) → T3 IX2/Lottie/GSAP → T4 contained code (canvas/JS only, logged).
- Animation → `motion-build`: Motion IR → tier route → build → `motion-verify.js` proof. IX2 is Designer-only (no API); GSAP is agent-buildable via `data_scripts_tool`.
- Skills lazy-load, one per need, source-isolated (Figma vs URL — never both).
- Project memory: `docs/memory/webflow/` — registry.md (incl. `## Motion-Preference`, `## Motion-Recipes`) · build_state.json · pending_designer_work.md · impossible_cases.md · error_learnings.md.
- Never: code for layout/spacing/type/color/hover, CSS shorthands, guessing values, placeholder content, broken icons, dropped effects, skipping verify.

Read `agents/webflow-goat.md` for all rules, workflow, and routing.
