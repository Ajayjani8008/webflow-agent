---
name: figma-setup
description: One-time Figma fetch + local cache. SCOPED by default (only sections in build scope); FULL for whole-page/site builds. Chunked, resumable, rate-limit aware. Run /figma-setup <url> once at project start. Supports resume if session dies.
---

# Figma Setup — Fetch + Cache

Command: `/figma-setup <figma-url>` → saves to `docs/memory/webflow/figma-cache/`. Different URL for one-off task → don't cache, work directly.

## Scope (decide first — don't over-fetch)

- **SCOPED (default):** user asked for specific sections/one page → fetch structure (`get_metadata`) + variables + ONLY the in-scope sections' nodes/screenshots/assets. Other sections stay `"pending"` in manifest — fetched on demand later (cache-on-fetch rule keeps them cached once touched).
- **FULL:** user building the whole page/site, or says "fetch everything" → all sections, chunked + prioritized below.
- Scope ambiguous → one question: "Fetch just [sections] or the whole file?"

## Step 0.0 — PERSIST IDENTITY FIRST (before any fetch — non-negotiable)

The #1 setup failure: session dies mid-fetch with no `file_key` saved → no resume, must re-ask user.

1. Parse `file_key` (+ `node-id`) from URL. Branch URL `…/design/:fileKey/branch/:branchKey/…` → use `branchKey`.
2. Immediately write `figma_url` + `file_key` to ALL THREE: `figma-cache/fetch_state.json`, `figma-cache/00-manifest.json`, `docs/memory/build_state.json`. Set `fetch_state.status = "in-progress"`.
3. Only then fetch.

**Recovery rule:** stored `file_key` lookup order = manifest → build_state → fetch_state. Cache empty + key stored → re-fetch, no re-ask. No key anywhere → ask URL once, run Step 0.0, never lose again. Never guess a key.

## Step 0 — Size detection

`get_metadata` on file_key (light) → count nodes/sections → classify:
SMALL <50 nodes → single fetch · MEDIUM 50-200 → 2-3 chunks · LARGE 200-500 → 5-8 chunks · MASSIVE 500+ → paginated, build-while-fetching. Write plan to `fetch_state.json`.

## Chunking

Split by Figma pages (1 page = 1 chunk). Single giant page (>20 sections) → sub-chunks of 5-8 sections, in order.

**Priority tiers (FULL scope):** T1 = user-mentioned + hero/nav/footer · T2 = main content · T3 = secondary (blog/testimonials/FAQ) · T4 = CMS-heavy/complex. Large files: fetch T1-2 → user starts building while T3-4 fetches.

## Rate limits

Figma REST: 60 req/min. Track count in fetch_state. Every 50 requests → pause 10s. 429 → backoff 10s/30s/60s/120s (then warn user). MCP fails → REST fallback for that chunk. REST fails → mark chunk "pending", continue.

## Fetch steps

1. **Structure + variables (always):** `get_metadata` → `01-structure.json` · `get_variable_defs` → `02-variables.json`.
2. **Nodes (scoped/chunked):** per section `get_design_context` → `03-nodes/{section}.json`. Update fetch_state per chunk. Between chunks: 5s pause; context low → report progress, offer continue later.
3. **Screenshots:** `get_screenshot` → `04-screenshots/{section}.png` (same rate handling).
4. **Assets:** download → `05-assets/`.
5. **Small extras (1-2 calls):** interactions → `09-interactions.json` · comments → `10-comments.json` · references → `11-references.json`.
6. **Components:** variants → `06-components.json`.
7. **Finalize:** tokens → `07-tokens.json` · queue → `08-build-queue.json` · manifest → `00-manifest.json` (status per section: `cached|fetching|pending`) · fetch_state status `complete` (or `partial-scoped`).
8. **Report:** file info, scope, chunks, requests, what's ready to build now.

## Resume

Save progress after EVERY chunk. New session: read fetch_state → `in-progress` → resume `chunks_pending[0]` · `complete` → use cache · `error` → report, user decides. **Partial cache = usable** — build cached sections immediately, don't wait.

```json
{"file_key":"abc123","scope":"scoped|full","total_chunks":5,"chunks_completed":[1,2],"chunks_pending":[3,4,5],"total_requests":156,"status":"in-progress"}
```

## Build-while-fetching (MASSIVE files)

Before building section X: manifest status `cached` → build · `fetching` → wait ≤60s or next cached section · `pending` → priority-fetch it now, then build.

## Error recovery

| Error | Recovery |
|---|---|
| Session dies mid-chunk | Resume from fetch_state last completed chunk |
| MCP fails one section | Skip, mark "error", continue |
| Repeated rate limit | Pause 120s, warn, resume; still failing → offer "fetch remaining later" |
| fetch_state corrupted | Re-detect from 01-structure.json what's cached, rebuild |
| New Figma URL | Fresh cache (new file_key), old preserved |
| No file_key stored anywhere | Setup never completed → ask URL once → Step 0.0 → continue. Never guess |
| Empty cache + stored file_key | Re-fetch from stored key, no re-ask |

## Conditional cache reads (during builds)

Per section: always `03-nodes/{section}.json` + `07-tokens.json` + `04-screenshots/{section}.png` + `05-assets/`. `has_animations` → +09 · `has_comments` → +10 · `references_count>0` → +11. Simple section = 4 reads.

## Invalidation

Figma edited after cache → stale → warn. Re-run `/figma-setup <same-url>` → re-fetch changed sections. Section missing from scoped cache → fetch on demand (cache-on-fetch), no full re-run needed.
