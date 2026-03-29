import fs from 'node:fs'
import { resolveRepoScopeId } from '../../repos/types.js'
import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ApplyObservationInput } from '../../memory/dto/apply-observation.dto.js'

export type CliResult = {
  code: number
}

export type CliIO = {
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}

export const parseArgValue = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

export const hasFlag = (argv: string[], name: string): boolean => argv.includes(name)

const hasObservationArgs = (argv: string[]): boolean =>
  ['--scope-type', '--scope-id', '--kind', '--subject', '--statement', '--details'].some(flag => argv.includes(flag))

export const resolveScope = (argv: string[]): ScopeRef => {
  const scopeType = parseArgValue(argv, '--scope-type') ?? 'repo'
  const explicitScopeId = parseArgValue(argv, '--scope-id')
  const scopeId = scopeType === 'repo' ? explicitScopeId ?? resolveRepoScopeId(process.cwd()) : explicitScopeId

  if (!scopeId) {
    throw new Error(`Missing --scope-id for scope type ${scopeType}.`)
  }

  return {
    type: scopeType as ScopeRef['type'],
    id: scopeId,
  }
}

export const readJsonInput = (argv: string[]): unknown => {
  const input = parseArgValue(argv, '--input')
  if (input) {
    return JSON.parse(input)
  }

  const file = parseArgValue(argv, '--input-file')
  if (file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  if (hasObservationArgs(argv) || process.stdin.isTTY) {
    return {}
  }

  try {
    const raw = fs.readFileSync(0, 'utf8').trim()
    if (!raw) {
      return {}
    }

    return JSON.parse(raw)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (code === 'EAGAIN') {
      return {}
    }

    throw error
  }
}

export const writeOutput = (io: CliIO, payload: unknown, json = false): void => {
  const text = json ? JSON.stringify(payload, null, 2) : typeof payload === 'string' ? payload : `${JSON.stringify(payload, null, 2)}`
  io.stdout.write(`${text}\n`)
}

export const resolveObservationSource = (input: Partial<ApplyObservationInput>): ApplyObservationInput['source'] =>
  input.source ?? null
