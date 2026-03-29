import type { InitApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { writeOutput } from './shared.js'

export const runInitCommand = async (app: InitApp, io: CliIO): Promise<CliResult> => {
  const result = app.initialize()
  writeOutput(io, result, true)
  return { code: 0 }
}
