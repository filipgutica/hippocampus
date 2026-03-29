# Hippocampus Memory Scope Skill

Use this guidance before submitting an observation to Hippocampus.

## Save only durable memories
- Save information that is likely to matter again later.
- Save preferences, conventions, recurring workflow details, and stable project facts.
- Do not save task-local state, ephemeral debugging notes, or one-off instructions.

## Choose scope explicitly
- Use `repo` scope for project-specific facts, conventions, and workflows tied to the current codebase.
- Use `user` scope for preferences and durable habits that apply across projects.
- Use `org` scope only when the fact truly belongs to a broader organization context.
- Do not ask Hippocampus to infer scope for you when the choice is clear from context.

## Think like AGENTS.md
- Treat repo scope like a repo-local `AGENTS.md`.
- Treat user scope like a global `AGENTS.md`.
- Prefer the narrowest scope that will still be useful later.

## Good candidates
- "This repository uses pnpm."
- "The user prefers concise implementation plans."
- "This project stores local state in `~/.hippocampus`."

## Bad candidates
- "We are debugging this one failing test right now."
- "The current branch name is feature/foo."
- "I just opened file X ten seconds ago."

## Before saving
- Ask whether the fact is likely to remain useful.
- Ask whether it should be scoped to a repo or to the user.
- If the answer is uncertain, do not save it yet.
