# Hippocampus Memory Bootstrap

Use this procedure to prime Hippocampus memory at the start of a new thread and to keep durable observations flowing back into memory.

## Startup Sequence
- Call `memory-get-policy` first.
- If the current work is in a repository, call `memory-list` for repo scope.
- Call `memory-list` for user scope using the user scope id that actually matches the durable preference namespace you want.
- If the task has a clear durable subject, call `memory-search` before making assumptions.

## Writing
- Save durable observations with `memory-apply-observation`.
- Use `memory-contradict` when a memory is stale, wrong, or replaced by newer state.
- Prefer one clear subject per memory.
- Do not save transient task state, one-off debugging breadcrumbs, branch names, or speculative guesses.

## Scope
- Treat repo scope like a repo-local `AGENTS.md`.
- Treat user scope like a global `AGENTS.md`.
- Use the narrowest scope that will remain useful later.

## Operational Notes
- The bootstrap wiring is client-specific.
- Claude Code uses a `SessionStart` hook in `~/.claude/settings.json`.
- Codex uses a `SessionStart` hook in `~/.codex/hooks.json`.
- The skill stays reusable even when the installer or hook mechanism changes.
