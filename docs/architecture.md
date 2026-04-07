# Hippocampus Architecture

Hippocampus is a local-first memory runtime for coding agents. It exposes a TypeScript CLI (`hippo`) and a Model Context Protocol (MCP) stdio server backed by a local SQLite database. Agents use MCP tools to read and write structured memories that persist across sessions and are scoped to a user or project.

---

## Repository layout

```
hippocampus/
├── src/                   # TypeScript source
│   ├── index.ts           # CLI entry point (#!/usr/bin/env node)
│   ├── app/               # App container factory and initialisation
│   ├── cli/               # CLI command handlers and setup tooling
│   │   └── commands/      # One file per CLI command
│   ├── mcp/               # MCP server, tools, and resources
│   │   ├── tools/         # One file per MCP tool
│   │   └── resources/     # One file per MCP resource
│   ├── memory/            # Core memory domain
│   │   ├── dto/           # Transport shapes (input/output contracts for CLI and MCP)
│   │   ├── policies/      # Policy logic: apply, ranking, scope validation
│   │   ├── types/         # Internal runtime shapes (Memory, MemoryEvent, MemoryEmbedding)
│   │   ├── memory.service.ts
│   │   ├── memory.repository.ts
│   │   ├── memory-event.repository.ts
│   │   ├── memory-embedding.repository.ts
│   │   ├── memory-ownership.repository.ts
│   │   ├── memory-runtime-state.repository.ts
│   │   ├── memory.types.ts         # Enums and discriminated unions
│   │   ├── local-embedding-provider.ts
│   │   ├── semantic-search.ts
│   │   └── subject-normalizer.ts
│   ├── common/            # Database init, migrations, Drizzle setup, shared utilities
│   │   ├── db/
│   │   │   ├── schema/    # Drizzle table definitions (one file per table)
│   │   │   ├── migrations.ts
│   │   │   ├── drizzle.ts
│   │   │   └── db.ts
│   │   └── types/         # Shared types (ScopeRef, ScopeType)
│   ├── projects/          # Project scope resolution and identity
│   ├── repos/             # Repo root detection
│   └── guidance/          # Guidance catalog (policy + scope skill URIs)
├── dist/                  # Compiled output (gitignored)
├── test/                  # Vitest integration tests
├── scripts/               # Build helpers and smoke tests
├── skills/                # Claude Code skill files shipped in the package
├── .notes/                # Agent-facing work tickets (todo / in-progress / complete)
└── docs/                  # Developer documentation (this file)
```

---

## Entry points

### CLI — `src/index.ts`

Calls `runCli()` from `src/cli/cli.ts`, which parses `argv` with yargs and dispatches to a command handler. Most commands build a `RuntimeApp` container and call the appropriate `MemoryService` method.

**Available commands:**

| Command | Description |
|---|---|
| `hippo init` | Initialise local state (`~/.hippocampus`) |
| `hippo apply` | Create or reinforce a memory |
| `hippo search` | Search memories by subject (exact or hybrid mode) |
| `hippo get-policy` | Print runtime policy and guidance references |
| `hippo mcp serve` | Start the MCP stdio server |
| `hippo project ensure` | Resolve and register the current project scope |
| `hippo memories list` | List active memories by scope |
| `hippo memories inspect --id` | Inspect a single memory record |
| `hippo memories history --id` | Show the event audit log for a memory |
| `hippo memories delete --id` | Soft-delete a memory (operator workflow) |
| `hippo memories archive-stale` | Archive stale memories |
| `hippo memories maintain` | Flush decayed retrieval strength |
| `hippo setup <target> [rc-file]` | Install session bootstrap wiring (`target`: `claude`, `codex`, `shell`) |
| `hippo uninstall [target] [rc-file]` | Remove session bootstrap wiring; interactive when `target` omitted; `--mode full-wipe` removes all |

### MCP server — `src/mcp/server.ts`

Started via `hippo mcp serve`. Registers tools and resources, then reads/writes through `MemoryService` identically to the CLI. The server is configured in `~/.claude.json` (Claude) or `~/.codex/config.toml` (Codex) as `npx -y hippocampus mcp serve`.

---

## App container

`src/app/build-app.ts` wires all dependencies and returns one of two container shapes:

**`InitApp`** — used by `hippo init`. Exposes only `InitService` (creates `~/.hippocampus`, runs migrations).

**`RuntimeApp`** — used by every other command and the MCP server. Wires:
- `MemoryRepository` — CRUD on memory records
- `MemoryEmbeddingRepository` — vector embeddings
- `MemoryEventRepository` — immutable audit log
- `MemoryOwnershipRepository` — resolves user/project ownership for scope-gated queries
- `MemoryRuntimeStateRepository` — last auto-archive sweep timestamp
- `LocalEmbeddingProvider` — Transformers.js semantic model
- `ProjectRepository` — project identity and path registration
- `MemoryService` — orchestrates all of the above

---

## Component map

```
   hippo <cmd>              hippo mcp serve
   (yargs CLI)              (MCP stdio server)
        │                          │
        └──────── RuntimeApp ──────┘
                       │
                 MemoryService
                 (src/memory/memory.service.ts)
          ┌────────────┼──────────────────┐
   MemoryRepository  EventRepo  EmbeddingRepo  OwnershipRepo
          └────────────┼──────────────────┘
                    SQLite
              (~/.hippocampus/hippocampus.db)

   LocalEmbeddingProvider         ProjectRepository
   (Xenova/bge-small-en-v1.5)     (src/projects/)
```

---

## Data flow: saving a memory

End-to-end for `hippo apply` or the `memory-apply-observation` MCP tool:

1. **Input** — CLI args are parsed into `ApplyObservationInput` (scope, type, subject, statement, origin, details, source). MCP mutation tools require `source = { channel: 'mcp', agent: 'codex' | 'claude', sessionId }`; CLI writes continue to use `{ channel: 'cli' }`.

2. **`MemoryService.applyObservation()`** (`src/memory/memory.service.ts`):
   - Canonicalises the scope (resolves project paths to absolute)
   - Normalises `subject` → `subjectKey` (lowercase, trimmed)
   - Optionally runs the auto-archive sweep if the cooldown has elapsed (24 h)
   - Calls `evaluateMemoryPolicy()` to decide: **reject** / **create** / **reinforce**

3. **Database transaction**:
   - Insert into `memories` (create) or update `reinforcement_count` + `strength` (reinforce)
   - Insert into `memory_events` (always — immutable audit record)
   - Event payloads are runtime-validated before `observationJson` / `sourceJson` are serialized

4. **Eager embedding** — after the transaction commits, `scheduleEagerEmbedding()` enqueues embedding generation as a microtask (`queueMicrotask`) via `LocalEmbeddingProvider`. The model (`Xenova/bge-small-en-v1.5`) runs locally; its cache lives at `$HIPPOCAMPUS_HOME/cache/transformers/`.

---

## Memory model

`src/common/db/schema/` is the Drizzle schema source of truth. Each table lives in its own file and exports both the table definition and inferred `*Row` / `New*Row` types for persistence-layer use.

Runtime migrations remain handwritten in `src/common/db/migrations.ts` and are the canonical migration path. This keeps the FTS5 virtual table and trigger setup explicit while Drizzle owns table schemas, inferred row types, and repository query execution. FTS5 reads use raw SQL via `better-sqlite3` directly because `memories_fts` is a virtual table rather than a normal Drizzle schema table.

`src/memory/types/` contains service-facing mapped shapes. `Memory` is the normalized runtime shape returned by `MemoryRepository`. `MemoryEvent` preserves the runtime event shape with `scope: ScopeRef` and raw stored JSON fields. `MemoryEmbedding` holds the cached vector shape from `MemoryEmbeddingRepository`.

`src/memory/dto/` contains transport shapes. `MemoryDto` is the outward memory contract returned by search/list/get and carries `latestEventSummary`. `MemoryEventDto` is the parsed event-history contract returned by `memory-get-history`.

`src/memory/memory.types.ts` defines enums and discriminated unions: `MemoryType`, `MemoryOrigin`, `MemoryStatus`, `MemoryEventType`, and `ApplyMemoryDecision`.

Key columns on a memory record (`memories` table):

| Field | Type | Description |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `user_id` | TEXT | FK to the local Hippocampus owner row |
| `project_id` | TEXT | Nullable FK to `projects`; populated for project scope |
| `scope_type` | TEXT | Compatibility scope snapshot: `user` or `project` |
| `scope_id` | TEXT | Compatibility scope snapshot: canonical path (project) or caller-provided user id |
| `memory_type` | TEXT | See memory types below |
| `subject` | TEXT | Human-readable subject label |
| `subject_key` | TEXT | Normalised subject used for uniqueness |
| `statement` | TEXT | The memory content |
| `details` | TEXT | Optional supporting metadata |
| `origin` | TEXT | How the memory was observed |
| `status` | TEXT | Lifecycle state |
| `reinforcement_count` | INTEGER | Times this memory has been reinforced |
| `strength` | REAL | Retrieval strength (1.0–5.0) |
| `retrieval_count` | INTEGER | Times retrieved |
| `last_reinforced_at` | TEXT | ISO timestamp |
| `last_retrieved_at` | TEXT | ISO timestamp |
| `superseded_by` | TEXT | FK to replacement memory (contradictions) |

### Event lifecycle

Memory events are created only on these state transitions:

| Path | Event(s) emitted |
|---|---|
| `applyObservation()` reject branch | `rejected` |
| `applyObservation()` create branch | `created` |
| `applyObservation()` reinforce branch | `reinforced` |
| `archiveStaleMemories()` | `archived` |
| `contradictMemory()` old memory | `contradicted` |
| `contradictMemory()` replacement memory | `created` |
| `deleteMemory()` | `deleted` |

`memory-get-history` returns parsed `MemoryEventDto[]` with structured `observation` and `source`. Search/list/get do not return full event arrays; they return `MemoryDto` objects with a compact `latestEventSummary` derived from the newest event for each memory.

---

## Types and enums

### MemoryType

Each memory type represents a different cognitive role. Choosing the right type determines how a memory is used during retrieval and reinforcement.

| Value | Intent | Examples |
|---|---|---|
| `procedural` | Repeatable actions, workflows, or if-then behaviours — the *how* | "Always run tests before committing", "Use pnpm, not npm" |
| `episodic` | Specific resolved events, past decisions, or situations — the *what happened* | "Migrated auth to JWT on 2024-03-10", "Fixed the N+1 query in user list" |
| `semantic` | Declarative facts or stable project understanding — the *what is* | "This service owns the billing domain", "The API uses cursor-based pagination" |
| `preference` | Stable user or project preferences — the *how we like it* | "Prefer arrow functions", "Use tabs not spaces", "Dark mode only" |
| `decision` | Durable choices with rationale — the *why we chose this* | "Chose SQLite over Postgres for local-first simplicity", "Rejected Redux; too much boilerplate" |

### MemoryOrigin

| Value | Initial status | Strength | When to use |
|---|---|---|---|
| `explicit_user_statement` | `active` | 3 | User directly stated something |
| `tool_observation` | `active` | 2 | Agent inferred from tool output or code |
| `observed_pattern` | `candidate` | 1 | Recurring signal not yet confirmed |

`observed_pattern` memories start as `candidate` and require reinforcement before they appear in normal search and list results.

### MemoryStatus

```
observed_pattern origin
    │
    └─► candidate ──(reinforce_count >= 3)──► active
                                                 │
other origins                                    ├──(stale sweep)──► archived
    │                                            │
    └──────────────────────────────────► active  └──(contradicted)──► suppressed
                                                 │
                                         any state ──(CLI delete)──► deleted
```

Archived and suppressed memories are retained and inspectable via `memories inspect` and `memories history` but are excluded from normal list and search results.

---

## Search

`MemoryService.searchMemories()` supports two match modes selected by the caller:

**`exact`** — Runs a normalized `subject_key` equality lookup via Drizzle (`WHERE subject_key = ? AND status = 'active'`). Fast and deterministic. Returns results ordered by retrieval strength and stable rank.

**`hybrid`** (default) — Runs both exact and semantic retrieval, then merges and deduplicates:
1. Exact `subject_key` lookup (same as exact mode above) — results appear first.
2. Semantic similarity scoring — generates a query embedding via `LocalEmbeddingProvider`, scores candidates by cosine similarity, filters to similarity ≥ 0.25, and appends any results not already in the exact set.

FTS5 is used **internally as a candidate pre-filter** within the semantic path: `listFtsCandidates()` queries the `memories_fts` virtual table to get a smaller candidate pool before embedding comparison. If FTS5 returns no results or matches the full active set, the semantic path falls back to a full scan of active memories. FTS5 is not a retrieval mode exposed to callers.

If the embedding model is unavailable when hybrid is requested, the search degrades to exact-only and returns a `fallbackReason`.

Retrieval side-effect: `retrieval_count` is incremented and `strength` is boosted (by `RETRIEVAL_BOOST_FACTOR`) once `retrieval_count` reaches `RETRIEVAL_BOOST_THRESHOLD`.

---

## Key policy constants

Defined in `src/memory/policies/memory.policy.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `REINFORCEMENT_CAP` | 5 | Max reinforcement count |
| `CANDIDATE_PROMOTION_THRESHOLD` | 3 | Reinforcements needed to promote candidate → active |
| `ARCHIVE_STALE_AFTER_DAYS_USER` | 90 | Days before a user-scope memory is archived |
| `ARCHIVE_STALE_AFTER_DAYS_PROJECT` | 365 | Days before a project-scope memory is archived |
| `AUTO_ARCHIVE_SWEEP_COOLDOWN_HOURS` | 24 | Minimum gap between automatic archive sweeps |
| `AUTO_ARCHIVE_SWEEP_LIMIT` | 50 | Max memories archived per sweep |
| `RETRIEVAL_DECAY_RATE` | 0.95 | Per-day strength decay for boosted memories |
| `RETRIEVAL_BOOST_THRESHOLD` | 3 | Retrieval count that triggers a strength boost |
| `RETRIEVAL_BOOST_FACTOR` | 1.1 | Multiplier applied at boost |
| `RETRIEVAL_STRENGTH_FLOOR` | 1.0 | Minimum strength value |
| `RETRIEVAL_STRENGTH_CAP` | 5.0 | Maximum strength value |
| `DEFAULT_MAINTENANCE_BATCH_SIZE` | 100 | Memories processed per `maintain` run |

---

## MCP surface

### Tools

| Tool | Description |
|---|---|
| `memory-apply-observation` | Create or reinforce a memory |
| `memory-search` | Search memories by subject (exact or hybrid mode) |
| `memory-list` | Broad recall by scope and optional type |
| `memory-get` | Fetch a single memory and its supersession chain |
| `memory-get-history` | Fetch the immutable event log for a memory |
| `memory-contradict` | Suppress an existing memory and create a replacement |
| `memory-get-policy` | Return the current policy and guidance resource URIs |
| `project-ensure` | Resolve and register the current project scope |

### Resources

| URI | Description |
|---|---|
| `hippocampus://policy/runtime-memory` | Canonical runtime usage guidance (when and what to store) |
| `hippocampus://skills/memory-scope` | Supporting guidance for choosing user or project scope |

---

## Local state layout

```
~/.hippocampus/                          # HIPPOCAMPUS_HOME
├── hippocampus.db                       # SQLite database (all memory data)
├── config.json                          # Schema version, currentUserId
├── installer-state.json                 # Tracks what `hippo setup` installed
├── bootstrap/
│   ├── claude-session-start.mjs        # Generated by `hippo setup claude`
│   └── codex-session-start.mjs         # Generated by `hippo setup codex`
└── cache/
    └── transformers/                    # Hugging Face model cache (bge-small-en-v1.5)
```

The default location is `~/.hippocampus`. Override with `HIPPOCAMPUS_HOME`.

---

## Session bootstrap wiring

`hippo setup <target>` installs lightweight integration so agents receive memory context at the start of every session — without the user having to ask.

**What gets installed:**

- **Claude**: A `SessionStart` hook entry in `~/.claude/settings.json` that runs `claude-session-start.mjs`, and a `mcpServers.hippo` entry in `~/.claude.json`.
- **Codex**: A `SessionStart` hook entry in `~/.codex/hooks.json` that runs `codex-session-start.mjs`, and a `[mcp_servers.hippo]` block in `~/.codex/config.toml`.
- **Shell**: A `PATH` block in the specified rc file so `hippo` / `hippocampus` resolves from a local dev build.

**How the bootstrap script works** (`bootstrap/claude-session-start.mjs` or `codex-session-start.mjs`):

1. Resolves the `hippo` or `hippocampus` binary from `PATH` via a login shell.
2. Calls `hippo get-policy` to fetch the current runtime policy.
3. Detects the git repo root (`git rev-parse --show-toplevel`) and calls `hippo project ensure --scope-id <root> --json`.
4. Uses the ensured project scope id to call `hippo memories list --scope-type project --scope-id <project-id> --limit 5`.
5. Reads Hippocampus `config.json` for `currentUserId` and calls `hippo memories list --scope-type user --scope-id <currentUserId> --limit 5` for local-owner bootstrap context.
6. Concatenates the results into `hookSpecificOutput.additionalContext` and writes it to stdout as JSON.

The agent runtime (Claude Code, Codex) injects `additionalContext` into the session context before the agent processes its first message.

`hippo uninstall [target]` reverses each step. Omitting `target` triggers interactive target selection. `--mode full-wipe` removes all managed integrations. All operations are idempotent.
