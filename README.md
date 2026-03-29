# Hippocampus

Hippocampus is a local-first memory layer for coding agents. It stores structured memories in SQLite, exposes them over a local MCP server, and keeps scope explicit so memories can be reused safely across runs.

## What It Does

Hippocampus currently supports:

- explicit init and lazy init on MCP startup
- structured memory capture through CLI and MCP
- scoped memory search
- memory inspection and history
- soft delete from the CLI for operator/debug workflows
- guidance delivery through an MCP resource

Local state lives in `~/.hippocampus` by default. Set `HIPPOCAMPUS_HOME` to use a different location.

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
- `memory-search`
- `memory-list`
- `memory-get`
- `memory-get-history`
- `memory-get-policy`
- `hippocampus://skills/memory-scope`

Note:

- destructive deletion is intentionally not exposed on the default MCP surface
- CLI delete is kept for operator/debug workflows

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
sqlite3 /tmp/hippo-dev/hippocampus.db "select id, kind, subject, status from memories;"
```

## Local CLI Examples

Apply a memory:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js apply \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --kind preference \
  --subject "Prefer pnpm" \
  --statement "Use pnpm for this repo."
```

Search active memories:

```bash
HIPPOCAMPUS_HOME=/tmp/hippo-dev node dist/index.js search \
  --scope-type repo \
  --scope-id /tmp/example-repo \
  --subject "prefer pnpm" \
  --json
```

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

- no contradiction workflow
- no decay workflow
- no semantic retrieval or embeddings
- no bulk reset or hard purge command
- no published Homebrew formula yet

## Next

The next step is to make the memory policy easier for agents to use correctly through:

- additional agent-facing skills and resources
- improved MCP tool descriptions

The goal is to improve how agents understand when and how to store, retrieve, and classify memories without pushing more inference into Hippocampus itself.

Hippocampus should continue to own deterministic runtime behavior such as validation, persistence, retrieval, and memory state transitions.
