import { randomUUID } from 'node:crypto'
import { AppError } from '../common/errors.js'
import { runTransaction } from '../common/db/db.js'
import { resolveCanonicalScopeId } from '../common/resolve-canonical-scope-id.js'
import { normalizeSubject } from './subject-normalizer.js'
import type { ApplyObservationInput } from './dto/apply-observation.dto.js'
import type { ContradictMemoryInput } from './dto/contradict-memory.dto.js'
import type { DeleteMemoryInput } from './dto/delete-memory.dto.js'
import type { GetPolicyResult } from './dto/get-policy.dto.js'
import type { ListMemoriesInput } from './dto/list-memories.dto.js'
import type { MemoryIdInput } from './dto/memory-id.dto.js'
import type { SearchMemoriesInput } from './dto/search-memories.dto.js'
import { validateScope } from './memory-scope.policy.js'
import {
  CANDIDATE_PROMOTION_THRESHOLD,
  REINFORCEMENT_CAP,
  capReinforcementValue,
  evaluateMemoryPolicy,
  getInitialMemoryStatus,
  memorySourceTypeDefinitions,
  memoryStatusDefinitions,
  pickStrongerSourceType,
  resolveReinforcedStatus,
} from './memory.policy.js'
import { rankMemories } from './memory-ranking.policy.js'
import { MemoryRepository } from './memory.repository.js'
import { MemoryEventRepository } from './memory-event.repository.js'
import type {
  ApplyMemoryResult,
  ContradictMemoryResult,
  DeleteMemoryResult,
  MemoryGetResult,
  MemoryHistoryResult,
  MemoryListResult,
  SearchResult,
} from './models/memory-result.js'
import type { MemoryRecord, ParsedMemoryEventRecord } from './models/memory-record.js'
import type { MemorySourceType } from './types/memory.types.js'
import type Database from 'better-sqlite3'
import {
  runtimeMemoryPolicyResource,
  supportingGuidanceResources,
} from '../guidance/guidance-catalog.js'
import type { ScopeRef } from '../common/types/scope-ref.js'

type MemoryServiceDeps = {
  memoryRepository: MemoryRepository
  memoryEventRepository: MemoryEventRepository
  policyVersion: string
  db: InstanceType<typeof Database>
}

const toPositiveLimit = (limit: number | null | undefined): number => {
  if (limit == null) {
    return 10
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError('INVALID_LIMIT', 'Limit must be a positive integer.')
  }

  return Math.min(limit, 100)
}

const parseStoredJson = <T>(value: string | null): T | null => {
  if (value == null) {
    return null
  }

  return JSON.parse(value) as T | null
}

const ensureNonEmpty = (value: string, code: string, message: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new AppError(code, message)
  }

  return trimmed
}

const ensureSourceType = (value: string): MemorySourceType => {
  if (memorySourceTypeDefinitions.some(definition => definition.value === value)) {
    return value as MemorySourceType
  }

  throw new AppError(
    'INVALID_SOURCE_TYPE',
    'sourceType must be one of explicit_user_statement, observed_pattern, or tool_observation.',
  )
}

const canonicalizeScope = (scope: ScopeRef): ScopeRef => ({
  type: scope.type,
  id: resolveCanonicalScopeId(scope.type, scope.id),
})

const toContradictionReason = ({ replacementMemoryId }: { replacementMemoryId: string }): string =>
  `Memory was contradicted and superseded by ${replacementMemoryId}.`

const toReplacementReason = ({ oldMemoryId }: { oldMemoryId: string }): string =>
  `Memory was created as the active replacement for contradicted memory ${oldMemoryId}.`

const toParsedEvent = (event: {
  id: string
  memoryId: string | null
  eventType: string
  scope: { type: 'user' | 'repo' | 'org'; id: string }
  kind: string
  subjectKey: string
  observationJson: string
  sourceJson: string | null
  reason: string
  createdAt: string
}): ParsedMemoryEventRecord => ({
  id: event.id,
  memoryId: event.memoryId,
  eventType: event.eventType as ParsedMemoryEventRecord['eventType'],
  scope: event.scope,
  kind: event.kind,
  subjectKey: event.subjectKey,
  observation: parseStoredJson(event.observationJson),
  source: parseStoredJson(event.sourceJson),
  reason: event.reason,
  createdAt: event.createdAt,
})

export class MemoryService {
  private readonly deps: MemoryServiceDeps

  constructor(deps: MemoryServiceDeps) {
    this.deps = deps
  }

  private createMemoryGetResult(memory: MemoryRecord): MemoryGetResult {
    if (!memory.supersededBy) {
      return {
        ...memory,
        supersededByMemory: null,
      }
    }

    const supersededByMemory = this.deps.memoryRepository.getById(memory.supersededBy)
    if (!supersededByMemory) {
      throw new AppError(
        'INTERNAL_INCONSISTENCY',
        `Expected superseding memory ${memory.supersededBy} for memory ${memory.id}.`,
      )
    }

    return {
      ...memory,
      supersededByMemory,
    }
  }

  applyObservation(input: ApplyObservationInput): ApplyMemoryResult {
    const scope = canonicalizeScope(validateScope(input.scope))
    const kind = ensureNonEmpty(input.kind, 'INVALID_KIND', 'Observation kind must not be empty.')
    const statement = ensureNonEmpty(input.statement, 'INVALID_STATEMENT', 'Observation statement must not be empty.')
    const sourceType = ensureSourceType(input.sourceType)
    const subjectKey = normalizeSubject(input.subject)
    const now = new Date().toISOString()

    const existing = subjectKey ? this.deps.memoryRepository.findSimilar(scope, kind, subjectKey) : null
    const decision = evaluateMemoryPolicy({
      policyVersion: this.deps.policyVersion,
      subjectKey,
      existingMemory: existing !== null,
    })

    return runTransaction(this.deps.db, () => {
      if (decision.decision === 'reject') {
        this.deps.memoryEventRepository.insert({
          eventType: 'rejected',
          scope,
          kind,
          subjectKey,
          observation: input,
          source: input.source ?? null,
          reason: decision.reason,
          now,
        })

        return decision
      }

      if (decision.decision === 'create') {
        const status = getInitialMemoryStatus(input.sourceType)
        const memory = this.deps.memoryRepository.insert({
          scope,
          kind,
          subject: input.subject.trim(),
          subjectKey,
          statement,
          details: input.details?.trim() ?? null,
          sourceType,
          status,
          policyVersion: this.deps.policyVersion,
          now,
        })

        this.deps.memoryEventRepository.insert({
          memoryId: memory.id,
          eventType: 'created',
          scope,
          kind: memory.kind,
          subjectKey,
          observation: input,
          source: input.source ?? null,
          reason: decision.reason,
          now,
        })

        return {
          decision: 'create',
          reason: decision.reason,
          policyVersion: decision.policyVersion,
          memory,
        }
      }

      if (!existing) {
        throw new AppError('INTERNAL_INCONSISTENCY', 'Expected an existing memory for reinforcement.')
      }

      const memory = this.deps.memoryRepository.reinforce({
        memory: existing,
        statement,
        details: input.details?.trim() ?? null,
        sourceType: pickStrongerSourceType(existing.sourceType, sourceType),
        confidence: capReinforcementValue(existing.confidence + 1),
        reinforcementCount: capReinforcementValue(existing.reinforcementCount + 1),
        status: resolveReinforcedStatus({
          currentStatus: existing.status,
          nextReinforcementCount: capReinforcementValue(existing.reinforcementCount + 1),
          nextSourceType: pickStrongerSourceType(existing.sourceType, sourceType),
        }),
        policyVersion: this.deps.policyVersion,
        now,
      })

      this.deps.memoryEventRepository.insert({
        memoryId: memory.id,
        eventType: 'reinforced',
        scope,
        kind: memory.kind,
        subjectKey,
        observation: input,
        source: input.source ?? null,
        reason: decision.reason,
        now,
      })

      return {
        decision: 'reinforce',
        reason: decision.reason,
        policyVersion: decision.policyVersion,
        memory,
      }
    })
  }

  searchMemories(input: SearchMemoriesInput): SearchResult {
    const scope = canonicalizeScope(validateScope(input.scope))
    const subject = input.subject ? normalizeSubject(input.subject) : null
    const items = rankMemories(
      this.deps.memoryRepository.search({
        scope,
        kind: input.kind?.trim() || null,
        subject,
      }),
    )

    return {
      items: items.slice(0, toPositiveLimit(input.limit)),
      total: items.length,
    }
  }

  listMemories(input: ListMemoriesInput): MemoryListResult {
    const scope = canonicalizeScope(validateScope(input.scope))
    const items = rankMemories(
      this.deps.memoryRepository.list({
        scope,
        kind: input.kind?.trim() || null,
        limit: null,
      }),
    )

    return {
      items: items.slice(0, toPositiveLimit(input.limit)),
      total: items.length,
    }
  }

  getMemory(input: MemoryIdInput): MemoryGetResult {
    const id = input.id.trim()
    if (!id) {
      throw new AppError('INVALID_MEMORY_ID', 'Memory id must not be empty.')
    }

    const memory = this.deps.memoryRepository.getById(id)
    if (!memory) {
      throw new AppError('MEMORY_NOT_FOUND', `Memory not found: ${id}`)
    }

    return this.createMemoryGetResult(memory)
  }

  getMemoryHistory(input: MemoryIdInput): MemoryHistoryResult {
    const memory = this.getMemory(input)
    const items = this.deps.memoryEventRepository.listByMemoryId(memory.id).map(toParsedEvent)

    return {
      items,
      total: items.length,
    }
  }

  deleteMemory(input: DeleteMemoryInput): DeleteMemoryResult {
    const memory = this.deps.memoryRepository.getById(input.id.trim())
    if (!memory) {
      throw new AppError('MEMORY_NOT_FOUND', `Memory not found: ${input.id.trim()}`)
    }

    if (memory.status === 'deleted') {
      throw new AppError('MEMORY_ALREADY_DELETED', `Memory already deleted: ${memory.id}`)
    }

    const now = new Date().toISOString()

    return runTransaction(this.deps.db, () => {
      const deletedMemory = this.deps.memoryRepository.softDelete({
        memory,
        now,
      })

      const event = this.deps.memoryEventRepository.insert({
        memoryId: deletedMemory.id,
        eventType: 'deleted',
        scope: deletedMemory.scope,
        kind: deletedMemory.kind,
        subjectKey: deletedMemory.subjectKey,
        observation: null,
        source: input.source ?? null,
        reason: 'Memory was soft deleted.',
        now,
      })

      return {
        memory: deletedMemory,
        event: toParsedEvent(event),
      }
    })
  }

  contradictMemory(input: ContradictMemoryInput): ContradictMemoryResult {
    const id = input.id.trim()
    if (!id) {
      throw new AppError('INVALID_MEMORY_ID', 'Memory id must not be empty.')
    }

    const memory = this.deps.memoryRepository.getById(id)
    if (!memory) {
      throw new AppError('MEMORY_NOT_FOUND', `Memory not found: ${id}`)
    }
    if (memory.status === 'deleted') {
      throw new AppError('MEMORY_ALREADY_DELETED', `Memory already deleted: ${memory.id}`)
    }
    if (memory.supersededBy) {
      throw new AppError('MEMORY_ALREADY_SUPERSEDED', `Memory already superseded: ${memory.id}`)
    }

    const replacementScope = canonicalizeScope(validateScope(input.replacement.scope))
    if (replacementScope.type !== memory.scope.type || replacementScope.id !== memory.scope.id) {
      throw new AppError('INVALID_REPLACEMENT_SCOPE', 'Replacement memory must keep the same scope as the contradicted memory.')
    }

    const replacementKind = ensureNonEmpty(
      input.replacement.kind,
      'INVALID_KIND',
      'Replacement kind must not be empty.',
    )
    if (replacementKind !== memory.kind) {
      throw new AppError('INVALID_REPLACEMENT_KIND', 'Replacement memory must keep the same kind as the contradicted memory.')
    }

    const replacementStatement = ensureNonEmpty(
      input.replacement.statement,
      'INVALID_STATEMENT',
      'Replacement statement must not be empty.',
    )
    const replacementSourceType = ensureSourceType(input.replacement.sourceType)
    const replacementSubjectKey = normalizeSubject(input.replacement.subject)
    if (!replacementSubjectKey) {
      throw new AppError('INVALID_SUBJECT', 'Replacement subject is empty after normalization.')
    }
    const now = new Date().toISOString()

    const existing = replacementSubjectKey
      ? this.deps.memoryRepository.findSimilar(replacementScope, replacementKind, replacementSubjectKey)
      : null
    if (existing && existing.id !== memory.id) {
      throw new AppError(
        'REPLACEMENT_MEMORY_ALREADY_EXISTS',
        `Active or candidate replacement already exists for subject ${input.replacement.subject.trim()}.`,
      )
    }

    return runTransaction(this.deps.db, () => {
      const replacementMemoryId = randomUUID()
      const suppressedMemory = this.deps.memoryRepository.suppress({
        memory,
        now,
      })

      const replacementMemory = this.deps.memoryRepository.insert({
        id: replacementMemoryId,
        scope: replacementScope,
        kind: replacementKind,
        subject: input.replacement.subject.trim(),
        subjectKey: replacementSubjectKey,
        statement: replacementStatement,
        details: input.replacement.details?.trim() ?? null,
        sourceType: replacementSourceType,
        status: 'active',
        policyVersion: this.deps.policyVersion,
        now,
      })

      const contradictedMemory = this.deps.memoryRepository.setSupersededBy({
        memory: suppressedMemory,
        supersededBy: replacementMemory.id,
        now,
      })

      const contradictedEvent = this.deps.memoryEventRepository.insert({
        memoryId: contradictedMemory.id,
        eventType: 'contradicted',
        scope: contradictedMemory.scope,
        kind: contradictedMemory.kind,
        subjectKey: contradictedMemory.subjectKey,
        observation: {
          ...input.replacement,
          details: input.replacement.details ?? null,
          source: input.source ?? null,
        },
        source: input.source ?? null,
        reason: toContradictionReason({
          replacementMemoryId: replacementMemory.id,
        }),
        now,
      })

      const replacementEvent = this.deps.memoryEventRepository.insert({
        memoryId: replacementMemory.id,
        eventType: 'created',
        scope: replacementMemory.scope,
        kind: replacementMemory.kind,
        subjectKey: replacementMemory.subjectKey,
        observation: {
          ...input.replacement,
          details: input.replacement.details ?? null,
          source: input.source ?? null,
        },
        source: input.source ?? null,
        reason: toReplacementReason({
          oldMemoryId: contradictedMemory.id,
        }),
        now,
      })

      return {
        contradictedMemory,
        replacementMemory,
        contradictedEvent: toParsedEvent(contradictedEvent),
        replacementEvent: toParsedEvent(replacementEvent),
      }
    })
  }

  getPolicy(): GetPolicyResult {
    const canonicalPolicy = {
      uri: runtimeMemoryPolicyResource.resourceUri,
      artifact: runtimeMemoryPolicyResource.artifact,
      title: runtimeMemoryPolicyResource.title,
    }
    const supportingGuidance = supportingGuidanceResources.map(resource => ({
      uri: resource.resourceUri,
      artifact: resource.artifact,
      title: resource.title,
    }))

    return {
      policyVersion: this.deps.policyVersion,
      description:
        'Compact summary of Hippocampus acceptance, matching, ranking, and contradiction rules, plus canonical and supporting guidance resource pointers.',
      acceptanceRules: [
        'scope type and id must be valid',
        'kind and statement must not be empty',
        'empty normalized subjects are rejected',
        'sourceType must be one of explicit_user_statement, observed_pattern, or tool_observation',
      ],
      matchingRules: [
        'subject is normalized before lookup',
        'matching uses exact normalized subject key in v1',
        'repo scope ids are canonicalized by symlink resolution only; the service does not infer repo root from subdirectory paths',
        'normal retrieval only returns active memories',
        'matching only treats candidate and active memories as live for reinforcement and duplicate detection',
        `candidate memories promote to active at reinforcement count >= ${CANDIDATE_PROMOTION_THRESHOLD}`,
      ],
      rankingRules: [
        'confidence desc',
        'last observed at desc',
        'reinforcement count desc',
        'subject asc',
        `confidence and reinforcement count are capped at ${REINFORCEMENT_CAP}`,
      ],
      sourceTypeDefinitions: memorySourceTypeDefinitions,
      statusDefinitions: memoryStatusDefinitions,
      contradictionRules: [
        'find the memory id with memory-search or memory-list before calling memory-contradict',
        'contradicting a memory suppresses the old memory and links it via supersededBy to the new active replacement',
        'memory-get returns supersededByMemory when a direct successor exists',
      ],
      guidanceArtifact: canonicalPolicy.artifact,
      guidanceResourceUri: canonicalPolicy.uri,
      canonicalPolicy,
      supportingGuidance,
      resources: [runtimeMemoryPolicyResource, ...supportingGuidanceResources].map(resource => ({
        role: resource.role,
        uri: resource.resourceUri,
        artifact: resource.artifact,
        title: resource.title,
      })),
    }
  }
}
