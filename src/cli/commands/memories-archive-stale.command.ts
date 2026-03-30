import type { RuntimeApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { formatArchiveStaleMemoriesResult, writeOutput } from './shared.js'

export const runMemoriesArchiveStaleCommand = async (
  app: RuntimeApp,
  input: {
    olderThanDays?: number | null
    dryRun?: boolean
  },
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.archiveStaleMemories({
    olderThanDays: input.olderThanDays ?? null,
    dryRun: input.dryRun ?? false,
    source: { channel: 'cli' },
  })

  writeOutput(io, json ? result : formatArchiveStaleMemoriesResult(result), json)
  return { code: 0 }
}
