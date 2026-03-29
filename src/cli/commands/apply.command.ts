import type { RuntimeApp } from '../../app/build-app.js'
import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ApplyObservationInput } from '../../memory/dto/apply-observation.dto.js'
import type { CliIO, CliResult } from './shared.js'
import { hasFlag, parseArgValue, readJsonInput, resolveObservationSource, resolveScope, writeOutput } from './shared.js'

export const runApplyCommand = async (app: RuntimeApp, argv: string[], io: CliIO): Promise<CliResult> => {
  const json = hasFlag(argv, '--json')
  const input = readJsonInput(argv) as Partial<ApplyObservationInput>
  const result = app.memoryService.applyObservation({
    scope: (input.scope ?? resolveScope(argv)) as ScopeRef,
    kind: input.kind ?? parseArgValue(argv, '--kind') ?? '',
    subject: input.subject ?? parseArgValue(argv, '--subject') ?? '',
    statement: input.statement ?? parseArgValue(argv, '--statement') ?? '',
    details: input.details ?? parseArgValue(argv, '--details') ?? null,
    source: resolveObservationSource(input),
  })

  writeOutput(io, result, json)
  return { code: 0 }
}
