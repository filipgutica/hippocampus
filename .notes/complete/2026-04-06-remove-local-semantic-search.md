---
title: "Remove local semantic search and embeddings"
ticket-id: "2026-04-06-remove-local-semantic-search"
session-id: "019d853f-18a7-70a0-8cea-de0a1912ca2a"
status: "complete"
created: "2026-04-06"
started: "2026-04-13"
completed: "2026-04-18"
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

Remove the local embedding and semantic-search pipeline from Hippocampus while keeping
memory taxonomy and core retrieval behavior intact. Simplify `memory-search` to exact
subject matching plus FTS, remove the embedding persistence/runtime wiring and
Transformers.js dependency, update CLI/MCP/docs/tests to match the new contract, and
validate the result with typecheck, lint, and tests.

## Completion Criteria

- Local embedding runtime, persistence, schema, and smoke script are removed.
- `memory-search` no longer exposes hybrid or fallback metadata and uses exact plus FTS only.
- Docs, MCP guidance, CLI behavior, and tests are updated to match the simplified contract.
- Validation passes for typecheck, lint, and the applicable test suites.
- Follow-up cleanup from simplification review is applied where it improves correctness or reduces noise without widening scope.

## Work Log

- 2026-04-13: Implemented the core semantic-search removal. Deleted the local embedding provider,
  semantic search helpers, embedding repository/schema/types, and semantic smoke script. Removed
  runtime wiring from `build-app`, removed the Transformers cache path from app paths, and rewrote
  the baseline schema/migrations so fresh databases no longer create `memory_embeddings`.
- 2026-04-13: Simplified the public retrieval contract. Removed search match-mode input and
  fallback metadata from DTOs, CLI parsing/output, and the MCP `memory-search` schema/description.
  Updated README, architecture docs, and runtime policy guidance to describe exact subject matching
  plus FTS retrieval only. Removed the `@huggingface/transformers` dependency and refreshed the lockfile.
- 2026-04-13: Updated test coverage to reflect the new behavior. Removed embedding-provider tests,
  replaced semantic-specific memory-service cases with exact/FTS cases, updated CLI/MCP tests for
  the simplified search contract, and validated the full change with `pnpm typecheck`, `pnpm lint`,
  and `pnpm test`.
- 2026-04-14: Performed a cleanup pass after simplification review. Restored dropped repo ignore
  patterns in `.gitignore`, removed stale architecture-doc references to Transformers cache
  internals, simplified low-signal tests, and narrowed the FTS recovery path so only actual MATCH
  parse failures degrade while unrelated repository errors still surface.
- 2026-04-18: Simplified the pre-release migration model to a single canonical first-run baseline
  that includes the current schema and FTS5 setup. Updated `docs/architecture.md` to remove the
  last stale hybrid/embedding references, aligned the legacy-db guard test with the one-migration
  baseline, and revalidated with targeted search/init tests plus typecheck and lint.

## Completion Summary

Removed the local semantic-search and embedding pipeline end to end while keeping FTS5 as the
retrieval layer. `memory-search` now uses exact subject matching plus FTS only, the embedding
runtime/schema/dependencies are gone, docs and MCP/CLI guidance were updated to the simplified
contract, and the pre-release DB setup was reduced to one canonical first-run baseline migration.
