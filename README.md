# Hippocampus

Hippocampus is a local-first memory layer for coding agents. It stores structured memories in SQLite, exposes them over a local MCP server, and keeps scope explicit so memories can be reused safely across runs.

## What It Does

Hippocampus currently supports:

- explicit init and lazy init on MCP startup
- structured memory capture through CLI and MCP
- explicit memory classification with `type` and `origin`
- scoped memory search
- bounded automatic archival of stale memories
- memory inspection and history
- contradiction and supersession through MCP
- soft delete from the CLI for operator/debug workflows
- explicit stale-memory archival from the CLI
- runtime policy and supporting guidance delivery through MCP resources

Local state lives in `~/.hippocampus` by default. Set `HIPPOCAMPUS_HOME` to use a different location.

Hybrid retrieval uses `Xenova/bge-small-en-v1.5` through Transformers.js. Model artifacts are cached automatically under Hippocampus home on first semantic use and reused across later runs:

- `$HIPPOCAMPUS_HOME/cache/transformers/`
- `~/.hippocampus/cache/transformers/` when `HIPPOCAMPUS_HOME` is unset

Cold-cache semantic retrieval may need network access once. If semantic retrieval is unavailable, `memory-search` falls back to exact results and tells the caller to broaden recall with `memory-list`.

Hippocampus is still pre-stable and local-only during development. The local SQLite schema may change, and local state may need to be reset between development iterations until a release compatibility policy is locked.

## Install and Run

Canonical published MCP server command:

```bash
npx -y hippocampus mcp serve
```

Global install:

```bash
npm install -g hippocampus
hippo init
hippo get-policy --json
```

Homebrew:

- planned, not yet published from this repo

## MCP Registration

The MCP integration target is the raw stdio server command:

```bash
npx -y hippocampus mcp serve
```

Codex example:

```bash
codex mcp add hippo -- npx -y hippocampus mcp serve
```

For other MCP-capable clients, configure the same command in the client’s MCP settings unless you have validated client-specific syntax separately.

### Session Bootstrap

Hippocampus can install proactive startup wiring for the two primary local agent clients:

```bash
hippo setup claude
hippo setup codex
hippo uninstall claude
hippo uninstall codex
```

- `hippo setup claude` writes a `SessionStart` hook into `~/.claude/settings.json`
- `hippo setup claude` also registers the Hippocampus MCP server in `~/.claude.json` when that entry is not already user-managed
- `hippo setup codex` writes a `SessionStart` hook into `~/.codex/hooks.json`
- `hippo setup codex` also registers the Hippocampus MCP server and enables Codex hooks in `~/.codex/config.toml` using an installer-owned managed block
- `hippo uninstall claude` removes only the installer-owned Claude hook, MCP registration, and generated bootstrap script
- `hippo uninstall codex` removes only the installer-owned Codex hook, managed MCP block, and generated bootstrap script
- sibling hooks inside a shared `SessionStart` entry are preserved on setup and uninstall
- Hippocampus will not overwrite an unmanaged `hippo` MCP entry; migrate or remove that config first
- both install the same bootstrap text so sessions start with `memory-get-policy`, repo-scope `memory-list`, user-scope `memory-list`, and subject-based `memory-search` guidance
- use `--dry-run` to preview the files before writing them

Default MCP surface:

- `memory-apply-observation`
- `memory-contradict`
- `memory-search`
- `memory-list`
- `memory-get`
- `memory-get-history`
- `memory-get-policy`
- `hippocampus://policy/runtime-memory`
- `hippocampus://skills/memory-scope`

Note:

- contradiction is intentionally exposed on the default MCP surface as a controlled mutation
- destructive deletion is still intentionally not exposed on the default MCP surface
- CLI delete is kept for operator/debug workflows
- no extra retrieval tool is exposed in v1; `memory-search` remains the query-based retrieval primitive
- `memory-search` requires `subject` and uses hybrid retrieval by default
- `memory-list` is the broad recall path for `scope + type`

Policy discovery flow:

- call `memory-get-policy` first to discover canonical and supporting guidance resources
- read `hippocampus://policy/runtime-memory` for runtime usage guidance
- read `hippocampus://skills/memory-scope` for scope selection guidance
- rely on MCP tool descriptions to reinforce when to search, list, inspect, contradict, or save

## Local Development

From a fresh checkout:

```bash
git clone <repo-url>
cd hippocampus
pnpm install
pnpm build
```

Run from built output:

```bash
node dist/index.js init
node dist/index.js get-policy --json
node dist/index.js mcp serve
```

Useful scripts:

```bash
pnpm setup:shell -- ~/.zshrc
pnpm start:cli -- get-policy --json
pnpm start:mcp
pnpm smoke:init
pnpm smoke:mcp
pnpm smoke:semantic
```

For local checkout development, add the built CLI to your shell `PATH` so `hippo` can be invoked from anywhere:

```bash
pnpm setup:shell -- ~/.zshrc
source ~/.zshrc
hippo uninstall shell ~/.zshrc
```

This appends a block like:

```bash
# hippo mcp
export PATH="/absolute/path/to/hippocampus/dist:$PATH"
```

## Local Debugging

Use an isolated app home to avoid polluting your default local state:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js init --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js mcp serve
```

Default local files:

- `~/.hippocampus/config.json`
- `~/.hippocampus/hippocampus.db`

If you set `HIPPOCAMPUS_HOME`, those files are created under that directory instead.

Semantic retrieval uses a cached `Xenova/bge-small-en-v1.5` model automatically. Exact search, init, MCP startup, and the rest of the app still work even if semantic retrieval is unavailable.
For a live provider smoke test, run `pnpm smoke:semantic` after building; it exercises a real Hugging Face model download/load through the provider and uses the local Transformers cache under Hippocampus home.

Inspect the SQLite database directly if needed:

```bash
sqlite3 /tmp/hippo-dev/hippocampus.db ".tables"
sqlite3 /tmp/hippo-dev/hippocampus.db "select id, memory_type as type, origin, subject, status, superseded_by from memories;"
```

## Local CLI Examples

Apply a memory:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js apply \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --type preference \
  --origin tool_observation \
  --subject "Prefer pnpm" \
  --statement "Use pnpm for this repo."
```

For `repo` scope, prefer the canonical absolute path to the repo root with symlinks resolved. The CLI still infers the repo root when `--scope-id` is omitted, but MCP callers should pass the root path explicitly.

Search active memories:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js search \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --subject "prefer pnpm" \
  --json
```

Use `memory-list` for broader recall by class of memory, for example `scope + type = preference`.

Fields to expect on stored memories:

- `origin`: why the memory exists: `explicit_user_statement`, `observed_pattern`, or `tool_observation`
- `type`: free-form string; prefer stable values like `preference`, `convention`, `workflow`, `project-fact`, or `tooling`
- `status`: lifecycle state: `candidate`, `active`, `suppressed`, `archived`, or `deleted`
- `supersededBy`: id of the direct replacement memory when a memory has been contradicted
- `lastReinforcedAt`: when the memory was last reaffirmed by write-side evidence
- `retrievalCount`, `lastRetrievedAt`, `strength`: retrieval-side salience signals updated by successful `memory-search` results only

Current retrieval behavior:

- `observed_pattern` memories start as `candidate`
- `candidate` memories do not appear in normal `memory-search` or `memory-list` results
- `memory-search` requires `subject` and uses hybrid retrieval by default
- `memory-search` degrades to exact results if semantic retrieval is unavailable
- `memory-search` updates retrieval-side salience for returned top-N memories only
- `memory-list` is the broad recall path for `scope + type`
- `memory-list`, `memory-get`, and `memory-get-history` stay retrieval-neutral
- retrieval `strength` decays over time from `lastRetrievedAt` and is used only as a search tie-break, not as evidence
- a `candidate` memory promotes to `active` after enough reinforcement
- stale `candidate` and `active` memories are archived only when both `lastReinforcedAt` and `lastRetrievedAt` are stale, or when they were never retrieved
- default archival thresholds are scope-aware: `user` and `org` archive after 90 days, `repo` archives after 365 days
- automatic archival runs on a 24-hour cooldown before normal retrieval flows
- `memories maintain` flushes decayed retrieval strength to the stored column for boosted memories; run explicitly or on a schedule; supports `--dry-run` and `--batch-size`
- archived memories stay inspectable through `memory-get` and `memory-get-history`
- archived memories are not resurrected by normal reinforcement; a new matching observation creates a new memory

Contradict a memory over MCP:

- call `memory-contradict` with the old memory id and a replacement draft
- Hippocampus suppresses the old memory, creates the new active replacement, and links the old one via `supersededBy`
- later `memory-get` calls on the old id return the old memory plus `supersededByMemory` so the agent can inspect updated state without another lookup

Inspect and manage stored memories:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories list \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --json

HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories archive-stale --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories archive-stale --older-than-days 60 --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories maintain --dry-run --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories maintain --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories inspect --id <memory-id> --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories history --id <memory-id> --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories delete --id <memory-id> --json
```

## Current Limitations

- first semantic use may need network access to populate the local model cache
- degraded exact fallback means semantic retrieval problems are non-fatal but still need to be noticed by callers
- no resurrection workflow for archived memories
- no bulk reset or hard purge command
- no published Homebrew formula yet

## Next

The next active area is memory linking on top of the explicit lifecycle state model.

- Keep `memory-search` query-based and `memory-list` as the broad recall surface unless a future pass intentionally changes that split.
- Add memory linking without weakening explicit lifecycle transitions or reviving archived memories implicitly.
- Memory linking is the next step after semantic retrieval, not part of the current feature set.
- A future cloud/service version may choose a larger embedding model, but that decision is out of scope here.

## First Release Checklist

- Stop rewriting or squashing migration history.
- Treat the on-disk database as a compatibility surface.
- Switch to additive-only migrations that preserve upgrade paths for existing local databases.

Hippocampus should continue to own deterministic runtime behavior such as validation, persistence, retrieval, and memory state transitions.
