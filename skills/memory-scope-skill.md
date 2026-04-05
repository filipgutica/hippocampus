# Hippocampus Memory Scope Guidance

Use this supporting guidance after reading the canonical runtime policy at `hippocampus://policy/runtime-memory`.

## Choose scope explicitly
- Use `repo` scope for conventions, workflows, and stable facts tied to one repository.
- Use `user` scope for durable personal preferences or habits that should carry across repositories.
- Use `org` scope only when the fact clearly belongs to a shared organizational context.
- Treat Hippocampus's local configured owner identity as internal runtime state, not as the meaning of external user-scope ids.
- Do not ask Hippocampus to infer scope when the right scope is already clear from context.
- For `repo` scope, use the canonical absolute path to the repo root with symlinks resolved.

## Think like AGENTS.md
- Treat `repo` scope like a repo-local `AGENTS.md`.
- Treat `user` scope like a global `AGENTS.md`.
- Treat `org` scope like shared guidance that should apply across related repos or teams.
- Prefer the narrowest scope that will still be useful later.

## Durable examples by scope
- Repo: `This repository uses pnpm.`
- Repo: `Local state for this project lives in ~/.hippocampus by default.`
- User: `The user prefers concise implementation plans.`
- Org: `This organization standardizes on a shared release workflow across repos.`

## Scope mistakes to avoid
- Do not put repo-only conventions into `user` scope.
- Do not put one person’s preference into `org` scope.
- Do not use a repo subdirectory as the scope id when the memory belongs to the repository as a whole.
- Do not save task-local or rapidly changing notes in any scope.

## Before saving
- Ask whether the fact is likely to remain useful.
- Ask which scope will make it reusable without leaking into unrelated work.
- If the right scope is unclear, wait rather than saving it too broadly.
