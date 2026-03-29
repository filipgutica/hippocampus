import type { RuntimeApp } from '../../app/build-app.js'
import type { MemoryIdInput } from '../../memory/dto/memory-id.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatMemoryRecord, writeOutput } from './shared.js'

export const runMemoriesInspectCommand = async (
  app: RuntimeApp,
  input: MemoryIdInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.getMemory(input)
  writeOutput(io, json ? result : formatMemoryRecord(result), json)
  return { code: 0 }
}
