import type { RuntimeApp } from '../../app/build-app.js'
import type { ListMemoriesInput } from '../../memory/dto/list-memories.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatMemoryListResult, writeOutput } from './shared.js'

export const runMemoriesListCommand = async (
  app: RuntimeApp,
  input: ListMemoriesInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.listMemories(input)
  writeOutput(io, json ? result : formatMemoryListResult(result), json)
  return { code: 0 }
}
