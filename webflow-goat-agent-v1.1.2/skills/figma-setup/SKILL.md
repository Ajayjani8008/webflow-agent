---
name: figma-setup
description: One-time full Figma fetch + local cache. For LARGE files: chunked, resumable, rate-limit aware. Run /figma-setup <url> once at project start. Supports resume if session dies.
---

# Figma Setup — One-Time Full Fetch

Command: `/figma-setup <figma-url>` — fetches ENTIRE file, saves to `docs/memory/figma-cache/`.

**Exception:** Different Figma URL for one-off task → don't cache, work directly.

## Step 0.0 — PERSIST IDENTITY FIRST (before any fetch — non-negotiable)

The instant `/figma-setup <url>` runs, BEFORE size detection or any node fetch, write the file identity to disk. This is what makes the cache resumable and re-fetchable. Skipping it is the #1 setup failure: a session that dies mid-fetch leaves an empty `file_key`, so no later session can resume or re-fetch — it has to re-ask the user for the URL.

1. Parse `file_key` (and `node-id` if present) from the URL. Branch URL `…/design/:fileKey/branch/:branchKey/…` → use `branchKey` as the key.
2. Immediately write `figma_url` + `file_key` into **all three**: `figma-cache/fetch_state.json`, `figma-cache/00-manifest.json`, and `docs/memory/build_state.json` (`figma_cache.file_key` + `file_key`). Set `fetch_state.status = "in-progress"`.
3. Only then proceed to size detection.

**Recovery rule (any build that needs Figma):** check for a stored `file_key` in manifest → build_state → fetch_state, in that order. If cache is empty AND no `file_key` is stored anywhere, do NOT guess a key and do NOT silently proceed — the setup never completed. Ask the user for the Figma URL ONCE, run Step 0.0 to persist it, then continue. Never lose it again after that.

## Size Detection (Step 0 — before fetching)

Before any fetch, detect file size to choose strategy:

```
1. get_metadata on file_key → returns full tree (light call, no rate limit concern)
2. Count: total_nodes, total_sections, total_images, total_components
3. Classify:
   - SMALL:  < 50 nodes, < 5 sections   → single-session fetch (default)
   - MEDIUM: 50-200 nodes, 5-15 sections → chunked fetch (2-3 chunks)
   - LARGE:  > 200 nodes, > 15 sections  → chunked fetch (many chunks, prioritize)
   - MASSIVE: > 500 nodes, > 30 sections  → paginated fetch, build-while-fetching
```

## Chunked Fetch Strategy

**Split by pages, not by individual sections.** Each Figma page = one chunk.

```
File structure:
  Page 1: "Landing" → hero, features, pricing, footer (4 sections)
  Page 2: "About" → team, values, history (3 sections)
  Page 3: "Blog" → post list, post detail (2 sections)

Chunks:
  Chunk 1: Page 1 (Landing) — 4 sections
  Chunk 2: Page 2 (About) — 3 sections
  Chunk 3: Page 3 (Blog) — 2 sections
```

**For files with single giant page (>20 sections):**
- Split into sub-chunks of 5-8 sections each
- Process in order: section 1-5, then 6-10, etc.

## Rate Limit Handling

**Figma REST API:** 60 requests/minute per token.
**Figma MCP:** Rate limit varies by plan.

```
Strategy:
1. Track request count in figma-cache/fetch_state.json
2. After every 50 requests → pause 10 seconds
3. If 429 error → exponential backoff:
   - 1st retry: wait 10s
   - 2nd retry: wait 30s
   - 3rd retry: wait 60s
   - 4th+ retry: wait 120s, warn user "Figma rate limited, pausing"
4. If MCP tool fails → fallback to REST for that chunk
5. If REST fails → skip chunk, mark as "pending", continue with next chunk
```

**Per-chunk rate budget:**
- Small file (<50 nodes): 1 chunk, ~30-50 requests → fits in 1 minute
- Medium file (50-200 nodes): 2-3 chunks → ~100-200 requests → need 2-4 minutes
- Large file (200-500 nodes): 5-8 chunks → ~200-400 requests → need 4-8 minutes
- Massive file (500+ nodes): 10+ chunks → ~500+ requests → need 10+ minutes, build-while-fetching

## Resume Logic

**Save progress after EVERY chunk.** If session dies, resume from last completed chunk.

**Progress file:** `figma-cache/fetch_state.json`

```json
{
  "file_key": "abc123",
  "total_chunks": 5,
  "chunks_completed": [1, 2, 3],
  "chunks_pending": [4, 5],
  "current_chunk": 4,
  "total_requests": 156,
  "last_request_at": "2026-07-11T12:15:00Z",
  "rate_limit_resets_at": "2026-07-11T12:16:00Z",
  "errors": [],
  "status": "in-progress"
}
```

**On resume (new session):**
1. Read `fetch_state.json`
2. If `status: "in-progress"` → resume from `chunks_pending[0]`
3. If `status: "complete"` → cache is done, use it
4. If `status: "error"` → report errors, let user decide: retry failed chunks or restart

**Partial cache = usable.** Even if only chunks 1-3 are done, sections from those chunks can be built immediately. Don't wait for full cache.

## Priority-Based Fetching

**Not all sections are equal.** Fetch critical sections first so building can start sooner.

```
Priority tiers (determined from get_metadata):
  TIER 1 (fetch first):  sections user explicitly mentioned, hero, navigation, footer
  TIER 2 (fetch second): main content sections (features, about, pricing)
  TIER 3 (fetch third):  secondary sections (blog, testimonials, FAQ)
  TIER 4 (fetch last):   CMS-heavy sections, complex interactive sections
```

**For large files, fetch Tier 1-2 first → user can start building while Tier 3-4 fetches in background.**

## Steps (chunked)

### Step 0 — Size detection & strategy
1. `get_metadata` → full tree (light call)
2. Count nodes, sections, classify size
3. Determine chunk strategy (single / by page / sub-chunks)
4. Determine priority tiers
5. Write `fetch_state.json` with plan

### Step 1 — Fetch structure + variables (always first, always fast)
1. `get_metadata` → `01-structure.json` (already done in step 0)
2. `get_variable_defs` → `02-variables.json`
3. These are small, always fit in one call

### Step 2 — Fetch nodes (chunked)

**Per chunk:**
```
For each section in chunk:
  1. get_design_context → node properties
  2. Save to 03-nodes/{section}.json
  3. Increment request count
  4. If request_count % 50 == 0 → pause 10s
  5. If rate limited → backoff, retry
  6. After chunk complete → update fetch_state.json
```

**Between chunks:**
```
1. Update fetch_state.json: chunks_completed++, chunks_pending--
2. If more chunks → wait 5s (be polite to API), then next chunk
3. If session running low on context → report progress, offer to continue later
```

### Step 3 — Fetch screenshots (chunked, same as nodes)
1. Per section: `get_screenshot` → `04-screenshots/{section}.png`
2. Batch: 5 screenshots per API call if supported
3. Same rate-limit handling as nodes

### Step 4 — Export assets (chunked)
1. Per image/vector: download → `05-assets/`
2. Batch: download multiple assets per call if supported
3. Same rate-limit handling

### Step 5 — Fetch interactions, comments, references (small, usually fit in 1-2 calls)
1. Interactions → `09-interactions.json`
2. Comments → `10-comments.json`  
3. References → `11-references.json`
4. These are typically small, rarely rate-limited

### Step 6 — Build component variants (if large component set)
1. Per component set: fetch variants → merge into `06-components.json`
2. May need multiple calls for files with many components

### Step 7 — Build tokens + queue + manifest
1. Merge all data → `07-tokens.json`
2. Build queue → `08-build-queue.json`
3. Write manifest → `00-manifest.json` (status: "cached")
4. Update `fetch_state.json` (status: "complete")

### Step 8 — Report
1. Summary: file info, chunks processed, total requests, time taken
2. If partial cache: "Chunks 1-3 done. Sections [list] ready to build. Chunks 4-5 still fetching."
3. If full cache: "All sections ready. Start building."

## Build-While-Fetching (for massive files)

**Don't wait for full cache if user wants to start building.**

```
After Tier 1-2 sections are cached:
  1. User can start building those sections
  2. Background: continue fetching Tier 3-4
  3. As each tier completes, more sections become available
  4. Agent checks manifest before each section build:
     - Section in cache? → build from cache
     - Section not in cache yet? → wait or skip to next cached section
```

**Manifest status per section:**
```json
{
  "sections": [
    { "name": "hero", "status": "cached", "priority": 1 },
    { "name": "features", "status": "cached", "priority": 1 },
    { "name": "pricing", "status": "cached", "priority": 2 },
    { "name": "testimonials", "status": "fetching", "priority": 3 },
    { "name": "blog", "status": "pending", "priority": 4 }
  ]
}
```

**Agent logic:**
```
Before building section X:
  1. Check manifest for section X status
  2. If "cached" → build
  3. If "fetching" → wait (max 60s) or skip to next cached section
  4. If "pending" → fetch this section now (priority fetch), then build
```

## Error Recovery

| Error | Recovery |
|---|---|
| Session dies mid-chunk | Resume from last completed chunk (fetch_state.json) |
| Figma MCP fails for one section | Skip section, mark as "error" in fetch_state, continue |
| Rate limit hit repeatedly | Pause 120s, warn user, resume. If still failing → offer "fetch remaining later" |
| Partial cache + user wants to build | Build from cached sections, fetch rest in background |
| fetch_state.json corrupted | Re-detect from 01-structure.json what's cached, rebuild fetch_state |
| User gives new Figma URL | Start fresh cache for new file, old cache preserved (different file_key) |
| Build needs Figma but no `file_key` stored anywhere | Setup never completed (Step 0.0 skipped). Ask user for URL once → run Step 0.0 to persist → continue. Do NOT guess a key. |
| Empty cache + non-empty `file_key` stored | Identity survived but fetch didn't finish → re-fetch from the stored key, no re-ask needed. |

## Conditional Cache Reads (during builds)

Per section, read only what's needed:
- Always: `03-nodes/{section}.json`, `07-tokens.json`, `04-screenshots/{section}.png`, `05-assets/`
- If `has_animations: true` → also `09-interactions.json`
- If `has_comments: true` → also `10-comments.json`
- If `references_count > 0` → also `11-references.json`

Simple text-only section: 4 reads. Complex section: 7 reads.

## Cache Invalidation

- User edits Figma after caching → status becomes "stale" → warn user
- Re-run `/figma-setup <same-url>` → re-fetch (incremental: only changed sections if possible)
- Section not in cache → re-run `/figma-setup` or fetch that section on demand
