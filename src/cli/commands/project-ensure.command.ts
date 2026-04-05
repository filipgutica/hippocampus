import type { RuntimeApp } from '../../app/build-app.js'
import type { CliIO, CliResult } from './shared.js'
import { writeOutput } from './shared.js'

export type ProjectEnsureInput = {
  scopeId?: string
}

export const runProjectEnsureCommand = async (
  app: RuntimeApp,
  io: CliIO,
  input: ProjectEnsureInput,
  json = false,
): Promise<CliResult> => {
  const result = app.memoryService.ensureProject({
    path: input.scopeId ?? null,
  })
  const output = {
    project: {
      ...result,
      path: result.repoRoot,
      ensured: true,
    },
  }

  writeOutput(
    io,
    json
      ? output
      : `project ensured.\nscope: project:${result.scope.id}\npath: ${result.repoRoot}\nidentity: ${result.identitySource}:${result.identityValue}`,
    json,
  )
  return { code: 0 }
}
