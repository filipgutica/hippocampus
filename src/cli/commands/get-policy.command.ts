import type { RuntimeApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { writeOutput } from './shared.js'

export const runGetPolicyCommand = async (app: RuntimeApp, io: CliIO): Promise<CliResult> => {
  writeOutput(io, app.memoryService.getPolicy(), true)
  return { code: 0 }
}
