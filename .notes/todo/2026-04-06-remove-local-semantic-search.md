---
title: "Remove local semantic search and embeddings"
status: "todo"
created: "2026-04-06"
started: null
completed: null
tags: ["simplification", "search", "embeddings", "fts"]
---

# Remove local semantic search and embeddings

## Planning Seed

### Decision Summary

Remove the local semantic search pipeline from the memory runtime. This includes the embedding
model, embedding storage, cosine similarity scoring, and the `@huggingface/transformers` dependency.
Retrieval will rely on FTS5 (already in place) plus an optional LLM-driven write-time normalization
step. A `keywords` array may be added to memory records to improve FTS recall without needing
vector similarity.

The goal is a leaner, faster, fully local-first implementation with no large model download on
first run and no GPU/WebGPU dependency surface.

---

### Rationale

- The local embedding model (`Xenova/bge-small-en-v1.5`) adds a ~40MB+ download on first use,
  requires WebGPU or CPU fallback, and loads a full ML pipeline inside a Node process.
- `@huggingface/transformers` is a heavyweight production dependency with its own transitive
  footprint; it has no place in a local CLI tool.
- Semantic search adds complexity to `memory.service.ts` (see `ensureMemoryEmbedding`,
  `searchBySemanticSimilarity`, `scheduleEagerEmbedding`) and requires a separate `memory_embeddings`
  table and repository that only exist to support it.
- FTS5 with well-normalized text and agent-supplied keywords is sufficient for the local use case.
- LLM normalization on write (subject normalization, synonym expansion into keywords) yields better
  retrieval signal than an on-device sentence embedding model at this scale.
- Cloud-grade semantic search (see Future Note below) should be designed at the infrastructure
  level, not bolted onto a local SQLite process.

---

### Removal Tasks

**Files to delete:**
- `src/memory/local-embedding-provider.ts` — `LocalEmbeddingProvider` class + `EmbeddingProvider`
  type alias; currently injected into `MemoryService` via `MemoryServiceDeps.embeddingProvider`
- `src/memory/semantic-search.ts` — `cosineSimilarity`, `getSemanticSourceText`,
  `getSourceTextHash`, `parseEmbedding`, `getSemanticSourceText`
- `src/memory/memory-embedding.repository.ts` — `MemoryEmbeddingRepository` (upsert, getByMemoryId)
- `src/common/db/schema/memory-embeddings.ts` — Drizzle schema for the `memory_embeddings` table
- `scripts/smoke-semantic.mjs` — smoke test for the embedding pipeline

**Code to remove from `memory.service.ts`:**
- `embeddingProvider` and `memoryEmbeddingRepository` from `MemoryServiceDeps`
- `ensureMemoryEmbedding()` private method (~30 lines)
- `searchBySemanticSimilarity()` private method (~90 lines)
- `scheduleEagerEmbedding()` private method (~15 lines)
- `isSemanticModelUnavailableError()` helper and its fallback block in `searchMemories()`
- All imports of `LocalEmbeddingProvider`, `EmbeddingProvider`, `MemoryEmbeddingRepository`,
  `cosineSimilarity`, `getSemanticSourceText`, `getSourceTextHash`, `parseEmbedding`
- `SEMANTIC_MIN_SCORE` constant and `ScoredMemory` type

**Search flow simplification in `searchMemories()`:**
- Remove `queryEmbedding` generation and the hybrid merge logic
- `searchMemories()` becomes a straight FTS5 + exact lookup only
- `SearchMatchMode` on `search-memories.dto.ts` can be simplified or removed — the `'hybrid'`
  option no longer has a distinct implementation from `'exact'`
- Remove `matchMode`, `requestedMatchMode`, `effectiveMatchMode`, `fallbackReason` from
  `SearchResult` if they only existed to communicate semantic fallback state

**DB: remove `memory_embeddings` table via migration:**
- Add a schema version 3 migration that `DROP TABLE IF EXISTS memory_embeddings`
- Remove `memory_embeddings` DDL and index from the existing migration
  (`CREATE TABLE memory_embeddings`, `idx_memory_embeddings_model_updated`)

**Dependency removal:**
- Remove `@huggingface/transformers` from `package.json` dependencies
- Run `pnpm install` to update the lockfile
- Remove `smoke:semantic` from `package.json` scripts

**Cache cleanup (optional / operator note):**
- The model was cached under `$HIPPOCAMPUS_HOME/cache/transformers/`; `hippo init` or a new
  `hippo prune-cache` command could clean it up, but this is not blocking

---

### Replacement / Enhancement Tasks

**LLM normalization — agent-side, not runtime:**
- Normalization belongs in the agent skill or tool description, not inside `applyObservation`.
  The runtime write path must stay synchronous, local, and LLM-free.
- Update the `apply-observation` MCP tool description and the `hippo apply` skill to instruct the
  calling agent to normalize the subject and statement before submitting (lowercase, canonical
  phrasing, no pronouns).
- `subject-normalizer.ts` (currently just lowercases) can stay as a lightweight runtime
  defense-in-depth step. No changes needed there.

**`keywords` field on memories (consider):**
- Add an optional `keywords: string[] | null` column to the `memories` table (migration)
- The calling agent populates `keywords` at observation time (agent-side LLM step, before the
  tool call), not inside the runtime write path
- The `ApplyObservationInput` DTO accepts an optional `keywords` array; the runtime stores it as-is
- Index keywords into FTS5 (add to the `memories_fts` virtual table content)
- This gives FTS5 broader surface area without needing vector similarity
- Schema sketch:
  ```sql
  ALTER TABLE memories ADD COLUMN keywords TEXT; -- JSON array, nullable
  -- Update memories_fts trigger/content to include keywords
  ```

**FTS5 query improvement:**
- After removing semantic fallback, review the FTS query in `memory.repository.ts` to ensure
  prefix matching and OR-style expansion are used where appropriate
- Consider exposing `matchMode: 'fts' | 'exact'` if callers still want subject-key exact lookup
  vs. FTS full-text search as distinct modes

---

### Future Note

Local FTS5 is the right retrieval layer for now. Cloud-grade semantic search can be revisited
when Hippocampus runs as a hosted service. At that point, CDC (change-data capture) from the
Postgres `memories` table into a streaming pipeline (Debezium → Kafka → Flink) with a downstream
OpenSearch index is the natural path. That design belongs at the infrastructure layer and is
fully out of scope for this local-first implementation.

---

## Approved Plan

Not started.

## Work Log

No work logged yet.

## Completion Summary

Not completed.
