import type { RuntimeApp } from '../../app/build-app.js'
import type { ApplyObservationInput } from '../../memory/dto/apply-observation.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { formatApplyResult, writeOutput } from './shared.js'

export const runApplyCommand = async (
  app: RuntimeApp,
  input: ApplyObservationInput,
  io: CliIO,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.applyObservation(input)

  writeOutput(io, json ? result : formatApplyResult(result), json)
  return { code: 0 }
}
