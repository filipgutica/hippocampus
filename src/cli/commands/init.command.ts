import type { InitApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { formatInitResult, writeOutput } from './shared.js'

export const runInitCommand = async (app: InitApp, io: CliIO, json = false): Promise<CliResult> => {
  const result = app.initialize()
  writeOutput(io, json ? result : formatInitResult(result), json)
  return { code: 0 }
}
