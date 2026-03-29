# Hippocampus Runtime Memory Policy

Use this policy first when deciding whether to retrieve or save memory through Hippocampus.

See `hippocampus://skills/memory-scope` for supporting guidance on choosing `repo`, `user`, or `org` scope.

## When to search memory
- Search when a stable preference, convention, workflow, or project fact may change the next action.
- Search before making assumptions about repository norms, user preferences, or durable environment facts.
- Search only within the scope that is actually relevant to the current work.

## When not to search memory
- Do not search for broad brainstorming, open-ended fishing, or facts that should come from the codebase or current task context.
- Do not search when the answer is already obvious from the current files, command output, or user instruction.
- Do not treat Hippocampus as a substitute for reading the repo or inspecting current state.

## Keep retrieval narrow
- Always choose scope explicitly.
- Prefer adding `subject` when you have a likely durable topic in mind.
- Add `kind` when you already know the class of memory you want.
- Use `memory-search` for targeted retrieval and `memory-list` only for orientation or debugging.
- In v1, subject matching is exact after normalization, so search with the clearest likely durable subject.

## Choose scope deliberately
- Use `repo` for repository-specific conventions, workflows, and stable project facts.
- Use `user` for durable personal preferences or habits that carry across repositories.
- Use `org` only when the fact clearly belongs to a broader organizational context.
- Prefer the narrowest scope that will still be useful later.

## When to save memory
- Save information that is likely to matter again in a future run.
- Good candidates include preferences, conventions, recurring workflow details, and stable project facts.
- Save observations in a structured form with an explicit scope, kind, subject, and concise statement.

## When not to save memory
- Do not save transient task state, one-off debugging notes, or instructions that only matter for the current run.
- Do not save speculative interpretations or low-confidence guesses.
- Do not save the same durable fact repeatedly when an existing memory already covers it.

## Avoid noisy or duplicate memory
- Before saving, ask whether the observation is durable, scoped correctly, and likely to help later.
- Prefer one clear subject for one durable fact rather than a bundle of loosely related notes.
- If the fact is uncertain or still changing, wait until it stabilizes.

## Example flows
- Retrieval flow: Before choosing a package manager command in a repo, search repo scope for subject `prefer pnpm` or a known workflow/preference kind.
- Save flow: After confirming a repo convention like `This repository uses pnpm`, save it in repo scope with a stable subject and statement.
- Skip flow: If you are in the middle of a one-off debugging session, do not save temporary stack traces, branch names, or test-specific notes.
