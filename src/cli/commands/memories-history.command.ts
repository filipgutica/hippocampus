import type { RuntimeApp } from '../../app/build-app.js'
import type { MemoryIdInput } from '../../memory/dto/memory-id.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatMemoryHistoryResult, writeOutput } from './shared.js'

export const runMemoriesHistoryCommand = async (
  app: RuntimeApp,
  input: MemoryIdInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.getMemoryHistory(input)
  writeOutput(io, json ? result : formatMemoryHistoryResult(result), json)
  return { code: 0 }
}
