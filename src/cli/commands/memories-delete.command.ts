import type { RuntimeApp } from '../../app/build-app.js'
import type { DeleteMemoryInput } from '../../memory/dto/delete-memory.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatDeleteMemoryResult, writeOutput } from './shared.js'

export const runMemoriesDeleteCommand = async (
  app: RuntimeApp,
  input: DeleteMemoryInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.deleteMemory(input)
  writeOutput(io, json ? result : formatDeleteMemoryResult(result), json)
  return { code: 0 }
}
