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
- Kind-only recall is a `memory-search` pattern: use `scope + kind` with no `subject` when you need a class of memories without falling back to a full list.
- Use `memory-search` for task retrieval and `memory-list` only for orientation or debugging.
- Normal retrieval only returns memories with `status = active`.
- In v1, subject matching is exact after normalization, so search with the clearest likely durable subject.

## Recommended kinds
- Prefer stable kind names unless a more specific kind is clearly warranted: `preference`, `convention`, `workflow`, `project-fact`, `tooling`.
- Inconsistent kind naming silently splits durable memories into separate buckets that will not surface together.

## Source Types
- `explicit_user_statement`: a durable fact, preference, or instruction directly stated by the user. New memories of this type normally start `active`.
- `observed_pattern`: a durable inference drawn from repeated corrections, approvals, or interaction patterns. New memories of this type normally start `candidate`.
- `tool_observation`: a durable fact derived from objective evidence such as repo files, config, docs, or tool output. New memories of this type normally start `active`.

## Status
- `candidate`: observed but not yet eligible for normal retrieval.
- `active`: eligible for normal retrieval.
- `suppressed`: contradicted or otherwise no longer trustworthy for normal retrieval.
- `archived`: historical and retained for context, but not normally retrieved.
- `deleted`: removed through an explicit operator workflow.

## Reinforcement and promotion
- Exact matching only treats `candidate` and `active` memories as live.
- Reinforcement increments both `reinforcementCount` and `confidence`.
- Both counters are capped at `5`.
- A `candidate` memory promotes to `active` at `reinforcementCount >= 3`.
- A stronger later `sourceType` can replace weaker provenance on reinforcement.

## Contradiction and supersession
- Use contradiction when an existing memory is no longer trustworthy and should point to newer state.
- Contradicting a memory suppresses the old memory, creates a new active replacement, and links the old one through `supersededBy`.
- `memory-get` returns the old memory as stored and embeds the full direct successor as `supersededByMemory` when that link exists.
- Contradiction is explicit in v1; there is no autonomous suppression or archival engine yet.

## Choose scope deliberately
- Use `repo` for repository-specific conventions, workflows, and stable project facts.
- Use `user` for durable personal preferences or habits that carry across repositories.
- Use `org` only when the fact clearly belongs to a broader organizational context.
- Prefer the narrowest scope that will still be useful later.
- For `repo` scope, use the canonical absolute path to the repo root with symlinks resolved. Do not use a subdirectory path when the memory belongs to the repository as a whole.

## When to save memory
- Save information that is likely to matter again in a future run.
- Good candidates include preferences, conventions, recurring workflow details, and stable project facts.
- Save observations in a structured form with an explicit scope, kind, subject, and concise statement.
- If you are saving `observed_pattern`, remember that it starts as `candidate` and will not appear in normal retrieval until reinforced enough to promote.

## When not to save memory
- Do not save transient task state, one-off debugging notes, or instructions that only matter for the current run.
- Do not save speculative interpretations or low-confidence guesses.
- Do not save the same durable fact repeatedly when an existing memory already covers it.

## Avoid noisy or duplicate memory
- Before saving, ask whether the observation is durable, scoped correctly, and likely to help later.
- Prefer one clear subject for one durable fact rather than a bundle of loosely related notes.
- If the fact is uncertain or still changing, wait until it stabilizes.

## Example flows
- Retrieval flow: Before choosing a package manager command in a repo, search repo scope for subject `prefer pnpm` or do kind-only recall such as `kind = preference` when you need that class of memories. Only active memories will be returned.
- Save flow: After confirming a repo convention like `This repository uses pnpm`, save it in repo scope with `sourceType = tool_observation`.
- Pattern flow: If the user repeatedly corrects long answers toward shorter ones, save that as `sourceType = observed_pattern` and expect it to remain `candidate` until reinforced enough to promote.
- Contradiction flow: If an old memory says `Use pnpm for this repo.` but the repo has moved to npm, contradict the old memory so it becomes `suppressed` and points to the new active replacement.
- Skip flow: If you are in the middle of a one-off debugging session, do not save temporary stack traces, branch names, or test-specific notes.
