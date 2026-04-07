---
title: "Complete Drizzle migration"
status: "complete"
created: "2026-04-06"
started: "2026-04-06"
completed: "2026-04-06"
tags: ["drizzle", "memory", "persistence"]
---

# Complete Drizzle migration

## Planning Seed

Continue the Drizzle migration after the schema/type cleanup and the core memory repository port.

Completed so far:

- Drizzle schema is split into one table per file under `src/common/db/schema/`.
- Drizzle-inferred `*Row` / `New*Row` types are the persistence type source for current schema files.
- Core `MemoryRepository` ordinary `memories` table reads/writes use Drizzle.
- Project, memory event, memory embedding, memory runtime state, and current-user upsert paths use Drizzle.
- The stale duplicate `src/common/db/schema.ts` file was removed.
- Architecture docs now state that Drizzle is the typed schema/query layer while runtime migrations remain handwritten for now.

Remaining at plan time:

- Move `MemoryRepository.listFtsCandidates` from direct `better-sqlite3.prepare` execution to Drizzle raw SQL execution while keeping FTS5 semantics unchanged.
- Keep handwritten migrations in `src/common/db/migrations.ts` as the canonical migration system.
- Keep FTS5 virtual table and trigger DDL in raw SQL migrations.
- Defer Drizzle Kit adoption unless a later workflow ticket intentionally adds it.

Constraints:

- Preserve CLI/MCP/DTO behavior.
- Keep public scope semantics unchanged.
- Avoid adding dependencies unless clearly necessary.
- Keep FTS5 behavior intact.

## Approved Plan

Finish the current migration by using Drizzle for normal repository interaction and Drizzle raw SQL for the FTS read path, while keeping raw SQL migrations canonical. Do not install `drizzle-kit`, do not add `drizzle.config.ts`, and do not change runtime migration ownership in this phase.

## Work Log

2026-04-06:

- Backfilled this ticket after realizing the previous completed note overstated the migration status.
- Current implementation has a completed core-memory-repository Drizzle port, but the overall Drizzle migration remains open because FTS, Drizzle Kit, and migration-management decisions are unresolved.
- Moved this ticket to `in-progress` to reflect that Drizzle migration work has started but is not complete.
- Approved the final boundary: raw SQL migrations remain canonical, Drizzle owns schemas/types/repository execution, and FTS reads should use Drizzle raw SQL without modeling `memories_fts` as a normal table.
- Moved `MemoryRepository.listFtsCandidates` from direct `better-sqlite3.prepare` execution to Drizzle raw SQL while preserving the existing FTS5 query semantics.
- Updated architecture docs to document raw SQL migrations as canonical and Drizzle as the schema/type/repository execution layer.
- Validated with `pnpm typecheck`, `pnpm lint`, `pnpm test`, `git diff --check`, and a prepare-call search confirming only migration-runner prepares remain under `src/memory` and `src/common/db`.

## Completion Summary

Completed under the approved boundary: Drizzle owns schema/type definitions and repository query execution, including the FTS read path via Drizzle raw SQL. Raw SQL migrations remain the canonical migration system so FTS5 virtual table and trigger DDL stay explicit. Drizzle Kit was intentionally not added in this phase.
