# Hippocampus

Hippocampus is a local-first memory layer for coding agents. It stores structured memories in SQLite, exposes them over a local MCP server, and keeps scope explicit so memories can be reused safely across runs.

## What It Does

Hippocampus currently supports:

- explicit init and lazy init on MCP startup
- structured memory capture through CLI and MCP
- explicit memory classification with `sourceType`
- scoped memory search
- memory inspection and history
- contradiction and supersession through MCP
- soft delete from the CLI for operator/debug workflows
- runtime policy and supporting guidance delivery through MCP resources

Local state lives in `~/.hippocampus` by default. Set `HIPPOCAMPUS_HOME` to use a different location.

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
- no extra retrieval tool is exposed in v1; `memory-search` remains the narrow, explicit retrieval primitive

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
pnpm start:cli -- get-policy --json
pnpm start:mcp
pnpm smoke:init
pnpm smoke:mcp
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

Inspect the SQLite database directly if needed:

```bash
sqlite3 /tmp/hippo-dev/hippocampus.db ".tables"
sqlite3 /tmp/hippo-dev/hippocampus.db "select id, kind, source_type, subject, status, superseded_by from memories;"
```

## Local CLI Examples

Apply a memory:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js apply \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --kind preference \
  --source-type tool_observation \
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

Kind-only broad recall should still use `memory-search`, for example `scope + kind = preference`, rather than `memory-list`.

Fields to expect on stored memories:

- `sourceType`: why the memory exists: `explicit_user_statement`, `observed_pattern`, or `tool_observation`
- `status`: lifecycle state: `candidate`, `active`, `suppressed`, `archived`, or `deleted`
- `supersededBy`: id of the direct replacement memory when a memory has been contradicted

Current retrieval behavior:

- `observed_pattern` memories start as `candidate`
- `candidate` memories do not appear in normal `memory-search` or `memory-list` results
- a `candidate` memory promotes to `active` after enough reinforcement

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

HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories inspect --id <memory-id> --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories history --id <memory-id> --json
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js memories delete --id <memory-id> --json
```

## Current Limitations

- no decay workflow
- no semantic retrieval or embeddings
- no broader semantic query helper beyond exact scoped retrieval
- no automatic suppression or archival engine beyond explicit contradiction
- no bulk reset or hard purge command
- no published Homebrew formula yet

## Next

The next active area is to extend lifecycle management beyond explicit contradiction and bounded promotion.

- Keep `memory-search` as the default retrieval primitive unless a future pass intentionally changes matching behavior.
- Add decay, archival, and contradiction-resolution workflows deliberately rather than relying on uncontrolled heuristics.

## First Release Checklist

- Stop rewriting or squashing migration history.
- Treat the on-disk database as a compatibility surface.
- Switch to additive-only migrations that preserve upgrade paths for existing local databases.

Hippocampus should continue to own deterministic runtime behavior such as validation, persistence, retrieval, and memory state transitions.
