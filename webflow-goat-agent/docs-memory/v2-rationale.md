# Why v2.0 — the measurement that changed the architecture

Read this before "optimising" the pack again. Every number here came from the actual session transcript
(`~/.claude/projects/C--Users-ajayk/a7caa65f-….jsonl`, 2026-07-31 21:35 → 2026-08-01 01:07 IST), not from
an estimate. v1.11.0 was built on an estimate and it was wrong by ~40×.

## What was actually measured

```
assistant turns          538
tool calls               245        (144 of them Bash)
context grew          51k  →  620k
cache_read       172,101,273 tok
cache_write        1,494,573 tok
output               824,038 tok
```

Header section slice alone: **235 turns · 107 tool calls · 72.5M context-read · 404k output · 51 minutes.**

Where the content actually lived:

| Thing | Real tokens | Share |
|---|---|---|
| all 6 images opened in the session | ~9,000 | 0.005% |
| every tool result over 4k chars (18 of them) | 43,000 | 0.02% |
| the full pack instruction set, loaded | ~55,000 | 0.03% |
| **the same content re-read 538 times** | **172,101,273** | **99.9%** |

Unique content ≈ 110k tokens. Everything else was re-reading it.

## The cost equation

**cost = turns × context size.** Payload size is a rounding error. A single silent reasoning turn at
turn 400 (context 474k) cost more than every image in the session combined.

## The v1.11.0 error, recorded so it is not repeated

v1.11.0 claimed an opened PNG costs **5k-66k tokens** ("66,328 for a 1920×900 render") and rebuilt the
whole verification story around not looking at images.

The real cost: Anthropic bills images at `(width × height) / 750` **after** downscaling the long edge to
1568px and capping at ~1.15MP. So:

| image | as sent | tokens |
|---|---|---|
| 3840×1800 built shot | 1568×735 | ~1,536 |
| 1920×900 hero render | 1566×734 | 1,533 |
| 1400×876 figma render | 1355×848 | 1,532 |
| 1632×118 header render | unchanged | 257 |

**~1,540 tokens is the ceiling at any resolution.** Verified independently against the transcript: six
image blocks = 917,364 base64 chars ≈ 9k tokens for all six, not 229,373.

The 229,373 figure was **context growth measured around image calls, misattributed to the images**. The
consequence was the worst possible trade: the pack rationed the single cheapest accuracy step it had
(looking at the reference render), and left the actual driver — turns × context — completely untouched.
Accuracy fell to 70-80% and cost stayed at ~250k/section.

**Rule for future changes: never infer a token cost from a context-size delta.** Context grows on every
call regardless of what that call did.

## What v2.0 changed

| Defect (all evidenced) | Fix |
|---|---|
| `CLAUDE.md` and `webflow-goat.md` byte-identical except frontmatter — ~10k tokens twice per session | router (≤6KB) + pointer agent (≤4KB) + rules in the `webflow-core` skill, loaded only on build lanes. `wf-lint` now fails on duplication and on either file exceeding budget |
| `rules/webflow/core.md` = 2.1k tokens of pure changelog, injected every session | moved to `$WF/CHANGELOG.md`, never loaded |
| pixel-verify said "ONE image view max" and "2-4 image views" in the same section | one corrected block: 2-4 views, ~6k tokens, reference view mandatory |
| example-hero built twice — page lock said "Home", writes went to another page id | `wf-resolve.js` locks site+page+section and blocks a mismatched write |
| one header shipped artefacts as both `example-nav` and `example-navbar` | `wf-resolve.js` warns on a near-miss section name before it forks |
| `publishes: 3` against a documented cap of 2 | cap enforced by `wf-resolve.js --publish`, `--force` recorded |
| 12-call verification pass, hand-assembled | `wf-section.js verify` = verify-section + dom-contract, one call, one verdict |
| 48 prose `Never` clauses re-read every turn | machine-checkable ones moved into `wf-preflight.js` (placeholder copy, code without authorization, div-imitation, icon flex-shrink, inline style, duplicate class, bare-px width, partial radius, BEM) |

Gates were not loosened anywhere. The ones that moved got *stronger*, because a regex does not forget at
turn 400 under a 500k context, and a sentence does.

## Targets

Per section: **≤15 tool calls · ≤25 turns · ≤50k peak context**, enforced as a checkpoint by
`wf-resolve.js --turns= --calls=`. Passing the budget is reported in one line and work continues —
cost is never a reason to drop a gate.
