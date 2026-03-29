import type { RuntimeApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { formatPolicyResult, writeOutput } from './shared.js'

export const runGetPolicyCommand = async (app: RuntimeApp, io: CliIO, json = false): Promise<CliResult> => {
  const result = app.memoryService.getPolicy()
  writeOutput(io, json ? result : formatPolicyResult(result), json)
  return { code: 0 }
}
