import type { RuntimeApp } from '../../app/build-app.js'
import type { SearchMemoriesInput } from '../../memory/dto/search-memories.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatSearchResult, writeOutput } from './shared.js'

export const runSearchCommand = async (
  app: RuntimeApp,
  input: SearchMemoriesInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.searchMemories(input)

  writeOutput(io, json ? result : formatSearchResult(result), json)
  return { code: 0 }
}
