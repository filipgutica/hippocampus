# Hippocampus Memory Scope Guidance

Use this supporting guidance after reading the canonical runtime policy at `hippocampus://policy/runtime-memory`.

## Choose scope explicitly
- Use `project` scope for conventions, workflows, and stable facts tied to one project.
- Use `user` scope for durable personal preferences or habits that should carry across projects.
- Treat Hippocampus's local configured owner identity as internal runtime state, not as the meaning of external user-scope ids.
- Do not ask Hippocampus to infer scope when the right scope is already clear from context.
- For `project` scope, use the canonical project scope id returned by `project ensure`.

## Think like AGENTS.md
- Treat `project` scope like a project-local `AGENTS.md`.
- Treat `user` scope like a global `AGENTS.md`.
- Prefer the narrowest scope that will still be useful later.

## Durable examples by scope
- Project: `This project uses pnpm.`
- Project: `Local state for this project lives in ~/.hippocampus by default.`
- User: `The user prefers concise implementation plans.`

## Scope mistakes to avoid
- Do not put project-only conventions into `user` scope.
- Do not use a project subdirectory as the scope id when the memory belongs to the project as a whole.
- Do not save task-local or rapidly changing notes in any scope.

## Before saving
- Ask whether the fact is likely to remain useful.
- Ask which scope will make it reusable without leaking into unrelated work.
- If the right scope is unclear, wait rather than saving it too broadly.
