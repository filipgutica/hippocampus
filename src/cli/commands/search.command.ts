import type { RuntimeApp } from '../../app/build-app.js'
import type { SearchMemoriesInput } from '../../memory/dto/search-memories.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { hasFlag, parseArgValue, resolveScope, writeOutput } from './shared.js'

export const runSearchCommand = async (app: RuntimeApp, argv: string[], io: CliIO): Promise<CliResult> => {
  const json = hasFlag(argv, '--json')
  const input: SearchMemoriesInput = {
    scope: resolveScope(argv),
    kind: parseArgValue(argv, '--kind') ?? null,
    subject: parseArgValue(argv, '--subject') ?? null,
    limit: parseArgValue(argv, '--limit') ? Number.parseInt(parseArgValue(argv, '--limit') ?? '10', 10) : null,
  }
  const result = app.memoryService.searchMemories(input)

  writeOutput(io, result, json)
  return { code: 0 }
}
