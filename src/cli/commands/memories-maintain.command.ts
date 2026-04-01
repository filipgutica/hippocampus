import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { RuntimeApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { formatMaintenanceResult, writeOutput } from './shared.js'

export const runMemoriesMaintainCommand = async (
  app: RuntimeApp,
  input: {
    scope?: ScopeRef | null
    batchSize?: number | null
    dryRun?: boolean
  },
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.runMaintenance({
    scope: input.scope ?? null,
    batchSize: input.batchSize ?? null,
    dryRun: input.dryRun ?? false,
  })

  writeOutput(io, json ? result : formatMaintenanceResult(result), json)
  return { code: 0 }
}
