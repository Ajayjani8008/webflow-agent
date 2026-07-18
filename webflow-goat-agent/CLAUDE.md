# Webflow GOAT — Router (v1.2.0)

ALL Webflow work — any size, any source — is handled by the **webflow-goat** agent (`agents/webflow-goat.md`) or done inline following its rules. Single source of truth = the agent file; this router adds nothing.

- End-to-end inline: intake → build → pixel-verify (tiered) → responsive-pass.
- Skills lazy-load, one per need, source-isolated (Figma vs URL — never both).
- Project memory: `docs/memory/webflow/` — registry.md · build_state.json · pending_designer_work.md · impossible_cases.md · error_learnings.md.
- Never: custom code (except user-invoked `/custom-code-once`), CSS shorthands, guessing values, skipping verify.

Read `agents/webflow-goat.md` for all rules, workflow, and routing.
