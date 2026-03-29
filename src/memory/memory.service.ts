import { AppError } from '../common/errors.js'
import { runTransaction } from '../common/db/db.js'
import { normalizeSubject } from './subject-normalizer.js'
import type { ApplyObservationInput } from './dto/apply-observation.dto.js'
import type { DeleteMemoryInput } from './dto/delete-memory.dto.js'
import type { GetPolicyResult } from './dto/get-policy.dto.js'
import type { ListMemoriesInput } from './dto/list-memories.dto.js'
import type { MemoryIdInput } from './dto/memory-id.dto.js'
import type { SearchMemoriesInput } from './dto/search-memories.dto.js'
import { validateScope } from './memory-scope.policy.js'
import { evaluateMemoryPolicy } from './memory.policy.js'
import { rankMemories } from './memory-ranking.policy.js'
import { MemoryRepository } from './memory.repository.js'
import { MemoryEventRepository } from './memory-event.repository.js'
import type { ApplyMemoryResult, DeleteMemoryResult, MemoryHistoryResult, MemoryListResult, SearchResult } from './models/memory-result.js'
import type { ParsedMemoryEventRecord } from './models/memory-record.js'
import type Database from 'better-sqlite3'
import {
  guidanceArtifact,
  guidanceResourceUri,
} from '../guidance/memory-scope-guidance.js'

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

  applyObservation(input: ApplyObservationInput): ApplyMemoryResult {
    const scope = validateScope(input.scope)
    const kind = input.kind.trim()
    const statement = input.statement.trim()
    const subjectKey = normalizeSubject(input.subject)
    const now = new Date().toISOString()
    if (!kind) {
      throw new AppError('INVALID_KIND', 'Observation kind must not be empty.')
    }
    if (!statement) {
      throw new AppError('INVALID_STATEMENT', 'Observation statement must not be empty.')
    }

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
        const memory = this.deps.memoryRepository.insert({
          scope,
          kind,
          subject: input.subject.trim(),
          subjectKey,
          statement,
          details: input.details?.trim() ?? null,
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
    const scope = validateScope(input.scope)
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
    const scope = validateScope(input.scope)
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

  getMemory(input: MemoryIdInput) {
    const id = input.id.trim()
    if (!id) {
      throw new AppError('INVALID_MEMORY_ID', 'Memory id must not be empty.')
    }

    const memory = this.deps.memoryRepository.getById(id)
    if (!memory) {
      throw new AppError('MEMORY_NOT_FOUND', `Memory not found: ${id}`)
    }

    return memory
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
    const memory = this.getMemory({ id: input.id })

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

  getPolicy(): GetPolicyResult {
    return {
      policyVersion: this.deps.policyVersion,
      description: 'Structured memories are accepted when scoped and non-empty; matching memories reinforce.',
      acceptanceRules: [
        'scope type and id must be valid',
        'kind and statement must not be empty',
        'empty normalized subjects are rejected',
      ],
      matchingRules: [
        'subject is normalized before lookup',
        'matching uses exact normalized subject key in v1',
      ],
      rankingRules: [
        'confidence desc',
        'last observed at desc',
        'reinforcement count desc',
        'subject asc',
      ],
      guidanceArtifact,
      guidanceResourceUri,
    }
  }
}
