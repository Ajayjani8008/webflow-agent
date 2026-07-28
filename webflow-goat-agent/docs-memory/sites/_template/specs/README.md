# Intake specs — one file per section, `<section>.md`

The spec written by design-intake / html-intake / url-intake (design-intake § Output format).
It is the **build contract and the diff target**: pixel-verify §2 compares the built section
against this file, not against anything remembered in conversation.

Why on disk (v1.10.0): a spec held only in context is lost on a crash, drifts in a long session,
and forces the whole intake→build→verify→responsive pipeline into one session — which is where the
token cost compounds. On disk, any fresh session can pick up a section cold.

Rules
- Written once at the end of intake, BEFORE the first build call.
- `effects:` row statuses updated in place as each resolves (`built`/`interactions-queued`/
  `code-tier`/`native-fallback`/`impossible`).
- Anything the build discovers that intake missed is appended in the same pass it is found.
- Never deleted after a section ships — it is the record of what was promised.
