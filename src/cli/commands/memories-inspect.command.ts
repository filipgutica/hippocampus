import type { RuntimeApp } from '../../app/build-app.js'
import type { MemoryIdInput } from '../../memory/dto/memory-id.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatMemoryGetResult, writeOutput } from './shared.js'

export const runMemoriesInspectCommand = async (
  app: RuntimeApp,
  input: MemoryIdInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.getMemory(input)
  writeOutput(io, json ? result : formatMemoryGetResult(result), json)
  return { code: 0 }
}
