# Hippocampus Runtime Memory Policy

Use this policy first when deciding whether to retrieve or save memory through Hippocampus.

See `hippocampus://skills/memory-scope` for supporting guidance on choosing `repo`, `user`, or `org` scope.

## When to search memory
- Search when a stable preference, convention, workflow, or project fact may change the next action.
- Search before making assumptions about repository norms, user preferences, or durable environment facts.
- Search only within the scope that is actually relevant to the current work.

## Bootstrap
- At the start of every new thread, call `memory-get-policy` first.
- Then call `memory-list` for repo scope when the current work is in a repository.
- Then call `memory-list` for user scope to prime durable personal preferences and habits.
- If the topic is clear and durable, call `memory-search` before making assumptions.
- Skip the bootstrap only when the thread is clearly ephemeral or Hippocampus is unavailable.

## When not to search memory
- Do not search for broad brainstorming, open-ended fishing, or facts that should come from the codebase or current task context.
- Do not search when the answer is already obvious from the current files, command output, or user instruction.
- Do not treat Hippocampus as a substitute for reading the repo or inspecting current state.

## Keep retrieval narrow
- Always choose scope explicitly.
- `memory-search` requires `subject`; use it when you have a likely durable topic in mind.
- Add `type` when you already know the class of memory you want.
- Use `memory-list` for broader recall with `scope + type`.
- Use `memory-search` for subject-based task retrieval and `memory-list` for orientation, debugging, or broad recall.
- Normal retrieval only returns memories with `status = active`.
- In v1, subject matching is exact after normalization, so search with the clearest likely durable subject.
- `memory-search` uses hybrid retrieval by default and falls back to exact if semantic retrieval is unavailable.
- If `memory-search` degrades to exact, broaden recall with `memory-list` using `scope + type`.
- Successful `memory-search` results update retrieval-side salience; `memory-list`, `memory-get`, and history reads do not.

## Memory Types
- `procedural`: automated behavior, workflows, or if-then style actions.
- `episodic`: a specific event, incident, or resolved situation.
- `semantic`: declarative knowledge, facts, or stable project understanding.
- `preference`: a stable user or project preference.
- `decision`: a durable choice together with its rationale.

Engram mapping for the mental model:
- `reflex` maps to `procedural`
- `episode` maps to `episodic`
- `fact` maps to `semantic`
- `preference` maps to `preference`
- `decision` maps to `decision`

## Origin
- `explicit_user_statement`: a durable fact, preference, or instruction directly stated by the user. New memories of this origin normally start `active`.
- `observed_pattern`: a durable inference drawn from repeated corrections, approvals, or interaction patterns. New memories of this origin normally start `candidate`.
- `tool_observation`: a durable fact derived from objective evidence such as repo files, config, docs, or tool output. New memories of this origin normally start `active`.

## Status
- `candidate`: observed but not yet eligible for normal retrieval.
- `active`: eligible for normal retrieval.
- `suppressed`: contradicted or otherwise no longer trustworthy for normal retrieval.
- `archived`: historical and retained for context, but not normally retrieved.
- `deleted`: removed through an explicit operator workflow.
- Stale `candidate` and `active` memories may be archived automatically before normal retrieval.

## Reinforcement and promotion
- Exact matching only treats `candidate` and `active` memories as live.
- Reinforcement increments `reinforcementCount`.
- `reinforcementCount` is capped at `5`.
- A `candidate` memory promotes to `active` at `reinforcementCount >= 3`.
- A stronger later `origin` can replace weaker provenance on reinforcement.
- `lastReinforcedAt` tracks write-side reaffirmation only; it is distinct from retrieval activity.

## Retrieval strength
- `retrievalCount`, `lastRetrievedAt`, and `strength` are operational ranking signals, not evidence.
- Only successful `memory-search` results update retrieval strength.
- Retrieval strength decays over time from `lastRetrievedAt` and is used only as a ranking tie-break after exact/semantic relevance.
- Automatic stale archival requires both write-side and retrieval-side staleness.
- A memory is stale only when `lastReinforcedAt` is beyond the threshold and `lastRetrievedAt` is either missing or beyond the threshold.
- Default stale thresholds are scope-aware: `user` and `org` use 90 days, `repo` uses 365 days.
- Automatic stale archival runs on a 24-hour cooldown before normal retrieval flows.
- `memories maintain` (CLI) flushes decayed retrieval `strength` to the stored column for boosted active memories. Run it explicitly or on a schedule; it does not run automatically. Supports `--dry-run` to preview and `--batch-size` to control how many memories are processed per invocation.

## Contradiction and supersession
- Use contradiction when an existing memory is no longer trustworthy and should point to newer state.
- Contradicting a memory suppresses the old memory, creates a new active replacement, and links the old one through `supersededBy`.
- `memory-get` returns the old memory as stored and embeds the full direct successor as `supersededByMemory` when that link exists.
- Contradiction is explicit in v1; archived memories are historical and not resurrected by reinforcement.
- Replacement memories may have a different `type` when the durable topic itself has changed.
- If an archived memory is contradicted, create a new active replacement rather than reviving the archived record.

## Choose scope deliberately
- Use `repo` for repository-specific conventions, workflows, and stable project facts.
- Use `user` for durable personal preferences or habits that carry across repositories.
- Use `org` only when the fact clearly belongs to a broader organizational context.
- Prefer the narrowest scope that will still be useful later.
- For `repo` scope, use the canonical absolute path to the repo root with symlinks resolved. Do not use a subdirectory path when the memory belongs to the repository as a whole.

## When to save memory
- Save information that is likely to matter again in a future run.
- Good candidates include preferences, conventions, recurring workflow details, and stable project facts.
- Save observations in a structured form with an explicit scope, type, subject, and concise statement.
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
- Retrieval flow: Before choosing a package manager command in a repo, search repo scope for subject `prefer pnpm`. If search degrades to exact and you need broader recall, use `memory-list` with `type = preference`. Only active memories will be returned.
- Save flow: After confirming a repo convention like `This repository uses pnpm`, save it in repo scope with `origin = tool_observation`.
- Pattern flow: If the user repeatedly corrects long answers toward shorter ones, save that as `origin = observed_pattern` and expect it to remain `candidate` until reinforced enough to promote.
- Contradiction flow: If an old memory says `Use pnpm for this repo.` but the repo has moved to npm, contradict the old memory so it becomes `suppressed` and points to the new active replacement.
- Skip flow: If you are in the middle of a one-off debugging session, do not save temporary stack traces, branch names, or test-specific notes.
- Semantic search flow: `memory-search` uses cached `Xenova/bge-small-en-v1.5` artifacts under Hippocampus home and falls back to exact retrieval if semantic loading or download is unavailable.
- Future note: a larger model may be appropriate for a future cloud/service offering, but that is not part of the local runtime policy today.
