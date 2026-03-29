# Hippocampus Repo Notes

## Purpose

Hippocampus is a local-first memory runtime for coding agents. The current system is centered on a TypeScript CLI, a local MCP server, and SQLite-backed memory storage.

## Design Philosophy

- Keep Hippocampus application logic as simple as possible.
- Prefer putting guidance about what to store, how to classify it, and when to reinforce it into skills, MCP resources, and tool descriptions.
- The agent should do most of the interpretation work before submitting observations or choosing how to retrieve memories.
- Hippocampus should remain responsible for validation, persistence, retrieval, and bounded state transitions.
- Avoid pushing rich inference, broad heuristics, or prompt-like behavioral policy into the application layer unless it is necessary for correctness.
- The most complex runtime logic in Hippocampus should be around memory state itself, such as reinforcement, future demotion/decay, and possibly linking. Even linking should stay at least partly agent-driven rather than becoming fully implicit system behavior.
- When in doubt, prefer explicit agent guidance over deeper application inference.

## Boundaries

- Keep CLI code thin. It should parse input, call services, and print output.
- Keep MCP code thin. It should register resources and tools, then delegate to services.
- Keep business behavior in the memory service and policy layer.
- Keep persistence behavior in repositories and migrations.
- Do not over-engineer the application layer just because a policy could be encoded in code. First ask whether that behavior belongs in an agent skill, resource, or tool description instead.

## Runtime Expectations

- Local state lives under `~/.hippocampus` unless `HIPPOCAMPUS_HOME` is set.
- `hippo init` is the explicit setup path.
- `hippo mcp serve` is allowed to lazily initialize local state.
- The default MCP surface allows durable writes and explicit contradiction, but keeps delete off by default. CLI delete is still allowed for operator/debug workflows.

## Development

- Prefer running against built output when validating local behavior.
- Use a temp `HIPPOCAMPUS_HOME` when testing or debugging manually.
- Keep changes narrow. Do not mix architecture refactors with behavior changes unless necessary.

## Database Compatibility

- Hippocampus is currently pre-stable and local-only/in development.
- The on-disk SQLite schema is not yet a supported compatibility contract.
- Until the first public release, migration history may be rewritten or squashed to match the current canonical schema.
- Before the first release, stop rewriting migration history and switch to additive-only migrations that preserve upgrade paths for existing local databases.

## Documentation

- Keep the README product-facing and usage-oriented.
- Update the README whenever behavior, commands, installation steps, or local development flow changes.
- Keep the README `Next` section current so it is easy to see what the next active area of work is.
- Keep this file concise. Do not duplicate details that are obvious from the code layout.
