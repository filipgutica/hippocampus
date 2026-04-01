import fs from 'node:fs'
import { resolveRepoScopeId } from '../../repos/types.js'
import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ApplyObservationInput } from '../../memory/dto/apply-observation.dto.js'
import type { InitResult } from '../../app/init.service.js'
import type {
  ApplyMemoryResult,
  ArchiveStaleMemoriesResult,
  DeleteMemoryResult,
  MemoryHistoryResult,
  MemoryListResult,
  SearchResult,
} from '../../memory/models/memory-result.js'
import type { GetPolicyResult } from '../../memory/dto/get-policy.dto.js'
import type { MemoryGetResult, MemoryRecord } from '../../memory/models/memory-record.js'

export type CliResult = {
  code: number
}

export type CliIO = {
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

export const parseArgValue = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

export const hasFlag = (argv: string[], name: string): boolean => argv.includes(name)

const hasObservationArgs = (argv: string[]): boolean =>
  ['--scope-type', '--scope-id', '--type', '--subject', '--statement', '--details', '--origin'].some(flag =>
    argv.includes(flag),
  )

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

const formatMemory = (memory: MemoryRecord): string =>
  [
    `id: ${memory.id}`,
    `scope: ${memory.scope.type}:${memory.scope.id}`,
    `type: ${memory.type}`,
    `subject: ${memory.subject}`,
    `subjectKey: ${memory.subjectKey}`,
    `statement: ${memory.statement}`,
    `details: ${memory.details ?? '-'}`,
    `origin: ${memory.origin}`,
    `reinforcementCount: ${memory.reinforcementCount}`,
    `policyVersion: ${memory.policyVersion}`,
    `status: ${memory.status}`,
    `supersededBy: ${memory.supersededBy ?? '-'}`,
    `createdAt: ${memory.createdAt}`,
    `updatedAt: ${memory.updatedAt}`,
    `lastReinforcedAt: ${memory.lastReinforcedAt}`,
    `retrievalCount: ${memory.retrievalCount}`,
    `lastRetrievedAt: ${memory.lastRetrievedAt ?? '-'}`,
    `strength: ${memory.strength}`,
    `deletedAt: ${memory.deletedAt ?? '-'}`,
  ].join('\n')

export const formatInitResult = (result: InitResult): string =>
  [
    result.initialized ? 'Hippocampus initialized.' : 'Hippocampus already initialized.',
    `home: ${result.paths.home}`,
    `configFile: ${result.paths.configFile}`,
    `dbFile: ${result.config.dbFile}`,
  ].join('\n')

export const formatApplyResult = (result: ApplyMemoryResult): string => {
  if (result.decision === 'reject') {
    return [`decision: reject`, `reason: ${result.reason}`, `policyVersion: ${result.policyVersion}`].join('\n')
  }

  if (!('memory' in result)) {
    return [`decision: ${result.decision}`, `reason: ${result.reason}`, `policyVersion: ${result.policyVersion}`].join(
      '\n',
    )
  }

  return [
    `decision: ${result.decision}`,
    `reason: ${result.reason}`,
    `policyVersion: ${result.policyVersion}`,
    '',
    formatMemory(result.memory),
  ].join('\n')
}

const formatMemoryCollection = (result: SearchResult | MemoryListResult): string => {
  if (result.items.length === 0) {
    return `total: ${result.total}\nitems: none`
  }

  return [
    `total: ${result.total}`,
    '',
    ...result.items.map((memory, index) => [`[${index + 1}]`, formatMemory(memory)].join('\n')),
  ].join('\n\n')
}

export const formatSearchResult = (result: SearchResult): string => {
  const header = [
    `requestedMatchMode: ${result.requestedMatchMode}`,
    `effectiveMatchMode: ${result.effectiveMatchMode}`,
  ]

  if (result.fallbackReason) {
    header.push(`notice: ${result.fallbackReason}`)
    header.push('guidance: for broader recall, use memory-list (memories list) with scope + type')
  }

  return [header.join('\n'), '', formatMemoryCollection(result)].join('\n')
}

export const formatMemoryListResult = (result: MemoryListResult): string => formatMemoryCollection(result)

export const formatArchiveStaleMemoriesResult = (result: ArchiveStaleMemoriesResult): string => {
  if (result.items.length === 0) {
    return [
      result.dryRun ? 'stale memories preview.' : 'stale memories archived.',
      `olderThanDays: ${result.olderThanDays}`,
      `cutoffAt: ${result.cutoffAt}`,
      `total: ${result.total}`,
      'items: none',
    ].join('\n')
  }

  return [
    result.dryRun ? 'stale memories preview.' : 'stale memories archived.',
    `olderThanDays: ${result.olderThanDays}`,
    `cutoffAt: ${result.cutoffAt}`,
    '',
    formatMemoryCollection(result),
  ].join('\n')
}

export const formatMemoryHistoryResult = (result: MemoryHistoryResult): string => {
  if (result.items.length === 0) {
    return `total: ${result.total}\nevents: none`
  }

  return [
    `total: ${result.total}`,
    '',
    ...result.items.map((event, index) =>
      [
        `[${index + 1}]`,
        `id: ${event.id}`,
        `memoryId: ${event.memoryId ?? '-'}`,
        `eventType: ${event.eventType}`,
        `scope: ${event.scope.type}:${event.scope.id}`,
        `type: ${event.type}`,
        `subjectKey: ${event.subjectKey}`,
        `reason: ${event.reason}`,
        `createdAt: ${event.createdAt}`,
        `observation: ${JSON.stringify(event.observation, null, 2)}`,
        `source: ${JSON.stringify(event.source, null, 2)}`,
      ].join('\n'),
    ),
  ].join('\n\n')
}

export const formatDeleteMemoryResult = (result: DeleteMemoryResult): string =>
  [
    'memory deleted.',
    '',
    formatMemory(result.memory),
    '',
    `deleteEventId: ${result.event.id}`,
    `deleteReason: ${result.event.reason}`,
  ].join('\n')

export const formatPolicyResult = (result: GetPolicyResult): string =>
  [
    `policyVersion: ${result.policyVersion}`,
    `description: ${result.description}`,
    '',
    'canonicalPolicy:',
    `- title: ${result.canonicalPolicy.title}`,
    `- uri: ${result.canonicalPolicy.uri}`,
    `- artifact: ${result.canonicalPolicy.artifact}`,
    '',
    'supportingGuidance:',
    ...result.supportingGuidance.flatMap(resource => [
      `- title: ${resource.title}`,
      `  uri: ${resource.uri}`,
      `  artifact: ${resource.artifact}`,
    ]),
    '',
    'resources:',
    ...result.resources.flatMap(resource => [
      `- role: ${resource.role}`,
      `  title: ${resource.title}`,
      `  uri: ${resource.uri}`,
      `  artifact: ${resource.artifact}`,
    ]),
  ].join('\n')

export const formatMemoryRecord = (memory: MemoryGetResult): string =>
  memory.supersededByMemory
    ? [formatMemory(memory), '', 'supersededByMemory:', '', formatMemory(memory.supersededByMemory)].join('\n')
    : formatMemory(memory)
