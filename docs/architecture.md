# Hippocampus Architecture

Hippocampus is a local-first memory runtime for coding agents. It exposes a TypeScript CLI (`hippo`) and a Model Context Protocol (MCP) stdio server backed by a local SQLite database. Agents use MCP tools to read and write structured memories that persist across sessions and are scoped to a user, repository, or organisation.

---

## Repository layout

```
hippocampus/
├── src/                   # TypeScript source
│   ├── index.ts           # CLI entry point (#!/usr/bin/env node)
│   ├── app/               # App container factory and initialisation
│   ├── cli/               # CLI command handlers and setup tooling
│   ├── mcp/               # MCP server, tools, and resources
│   ├── memory/            # Core memory domain: service, repositories, policy, search
│   ├── common/            # Database init, migrations, shared utilities
│   ├── guidance/          # Guidance catalog (policy + scope skill)
│   └── repos/             # Repo scope resolution helpers
├── dist/                  # Compiled output (gitignored)
├── test/                  # Vitest integration tests
├── scripts/               # Build helpers and smoke tests
├── skills/                # Claude Code skill files shipped in the package
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
| `hippo search` | Semantic / full-text memory search |
| `hippo get-policy` | Print runtime policy and guidance references |
| `hippo mcp serve` | Start the MCP stdio server |
| `hippo memories list` | List active memories by scope |
| `hippo memories inspect --id` | Inspect a single memory record |
| `hippo memories history --id` | Show the event audit log for a memory |
| `hippo memories delete --id` | Soft-delete a memory (operator workflow) |
| `hippo memories archive-stale` | Archive stale memories |
| `hippo memories maintain` | Flush decayed retrieval strength |
| `hippo setup <target> [rc-file]` | Install session bootstrap wiring (`target`: `claude`, `codex`, `shell`) |
| `hippo uninstall [target] [rc-file]` | Remove session bootstrap wiring; interactive when `target` omitted; `--mode full-wipe` removes all |

### MCP server — `src/mcp/server.ts`

Started via `hippo mcp serve`. Registers 7 tools and 2 resources, then reads/writes through `MemoryService` identically to the CLI. The server is configured in `~/.claude.json` (Claude) or `~/.codex/config.toml` (Codex) as `npx -y hippocampus mcp serve`.

---

## App container

`src/app/build-app.ts` wires all dependencies and returns one of two container shapes:

**`InitApp`** — used by `hippo init`. Exposes only `InitService` (creates `~/.hippocampus`, runs migrations).

**`RuntimeApp`** — used by every other command and the MCP server. Wires:
- `MemoryRepository` — CRUD on memory records
- `MemoryEmbeddingRepository` — vector embeddings
- `MemoryEventRepository` — immutable audit log
- `MemoryRuntimeStateRepository` — last auto-archive sweep timestamp
- `LocalEmbeddingProvider` — Transformers.js semantic model
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
          ┌────────────┼────────────┐
   MemoryRepository  EventRepo  EmbeddingRepo
          └────────────┼────────────┘
                    SQLite
              (~/.hippocampus/memory.db)
                       │
           LocalEmbeddingProvider
          (Xenova/bge-small-en-v1.5)
```

---

## Data flow: saving a memory

End-to-end for `hippo apply` or the `memory-apply-observation` MCP tool:

1. **Input** — CLI args are parsed into `ApplyObservationInput` (scope, type, subject, statement, origin, details, source). MCP input goes through the same DTO.

2. **`MemoryService.applyObservation()`** (`src/memory/memory.service.ts`):
   - Canonicalises the scope (resolves repo paths to absolute)
   - Normalises `subject` → `subjectKey` (lowercase, trimmed)
   - Optionally runs the auto-archive sweep if the cooldown has elapsed (24 h)
   - Calls `evaluateMemoryPolicy()` to decide: **reject** / **create** / **reinforce**

3. **Database transaction**:
   - Insert into `memories` (create) or update `reinforcement_count` + `strength` (reinforce)
   - Insert into `memory_events` (always — immutable audit record)

4. **Eager embedding** — after the transaction commits, `scheduleEagerEmbedding()` enqueues embedding generation as a microtask (`queueMicrotask`) via `LocalEmbeddingProvider`. The model (`Xenova/bge-small-en-v1.5`) runs locally; its cache lives at `$HIPPOCAMPUS_HOME/cache/transformers/`.

---

## Memory model

Key columns on a memory record (`memories` table):

| Field | Type | Description |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `scope_type` | TEXT | `user`, `repo`, or `org` |
| `scope_id` | TEXT | Absolute path (repo), username (user), org identifier |
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

---

## Types and enums

### MemoryType

| Value | Intent |
|---|---|
| `procedural` | Repeatable actions or if-then behaviours |
| `episodic` | Specific resolved events or situations |
| `semantic` | Declarative facts or project understanding |
| `preference` | Stable user or project preferences |
| `decision` | Durable choices with rationale |

### MemoryOrigin

| Value | Initial status | Strength |
|---|---|---|
| `explicit_user_statement` | `active` | 3 |
| `tool_observation` | `active` | 2 |
| `observed_pattern` | `candidate` | 1 |

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

## Search: hybrid retrieval

`MemoryService.searchMemories()` runs in two stages:

1. **Semantic** — generates a query embedding, computes cosine similarity against all active memory embeddings in scope, filters to similarity ≥ 0.25, and ranks by score → retrieval strength → stable rank. Returns up to N results (default 10, max 100).

2. **FTS fallback** — if the embedding model is unavailable or no semantic results pass the threshold, falls back to SQLite FTS5 full-text search on `subject`, `statement`, and `details`.

Retrieval side-effect: `retrieval_count` is incremented and `strength` is boosted (by `RETRIEVAL_BOOST_FACTOR`) once `retrieval_count` reaches `RETRIEVAL_BOOST_THRESHOLD`.

---

## Key policy constants

Defined in `src/memory/memory.policy.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `REINFORCEMENT_CAP` | 5 | Max reinforcement count |
| `CANDIDATE_PROMOTION_THRESHOLD` | 3 | Reinforcements needed to promote candidate → active |
| `ARCHIVE_STALE_AFTER_DAYS_USER` | 90 | Days before a user-scope memory is archived |
| `ARCHIVE_STALE_AFTER_DAYS_REPO` | 365 | Days before a repo-scope memory is archived |
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
| `memory-search` | Semantic / FTS hybrid search |
| `memory-list` | Broad recall by scope and optional type |
| `memory-get` | Fetch a single memory and its supersession chain |
| `memory-get-history` | Fetch the immutable event log for a memory |
| `memory-contradict` | Suppress an existing memory and create a replacement |
| `memory-get-policy` | Return the current policy and guidance resource URIs |

### Resources

| URI | Description |
|---|---|
| `hippocampus://policy/runtime-memory` | Canonical runtime usage guidance (when and what to store) |
| `hippocampus://skills/memory-scope` | Supporting guidance for choosing repo, user, or org scope |

---

## Local state layout

```
~/.hippocampus/                          # HIPPOCAMPUS_HOME
├── memory.db                            # SQLite database (all memory data)
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
3. Detects the git repo root (`git rev-parse --show-toplevel`) and calls `hippo memories list --scope-type repo --scope-id <root> --limit 5`.
4. Reads the OS username and calls `hippo memories list --scope-type user --scope-id <user> --limit 5`.
5. Concatenates the results into `hookSpecificOutput.additionalContext` and writes it to stdout as JSON.

The agent runtime (Claude Code, Codex) injects `additionalContext` into the session context before the agent processes its first message.

`hippo uninstall [target]` reverses each step. Omitting `target` triggers interactive target selection. `--mode full-wipe` removes all managed integrations. All operations are idempotent.
