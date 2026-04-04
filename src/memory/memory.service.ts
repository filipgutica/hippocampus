import { randomUUID } from 'node:crypto'
import { AppError } from '../common/errors.js'
import { runTransaction } from '../common/db/db.js'
import { resolveCanonicalScopeId } from '../common/resolve-canonical-scope-id.js'
import { MemoryEmbeddingRepository } from './memory-embedding.repository.js'
import type { EmbeddingProvider } from './local-embedding-provider.js'
import { normalizeSubject } from './subject-normalizer.js'
import {
  memoryDraftInputSchema,
  observationSourceSchema,
  type ApplyObservationInput,
  type MemoryDraftInput,
  type ObservationSource,
} from './dto/apply-observation.dto.js'
import type { ContradictMemoryInput } from './dto/contradict-memory.dto.js'
import type { DeleteMemoryInput } from './dto/delete-memory.dto.js'
import type { GetPolicyResult } from './dto/get-policy.dto.js'
import type { ListMemoriesInput } from './dto/list-memories.dto.js'
import type { MemoryIdInput } from './dto/memory-id.dto.js'
import type { SearchMatchMode, SearchMemoriesInput } from './dto/search-memories.dto.js'
import { validateScope } from './policies/memory-scope.policy.js'
import {
  AUTO_ARCHIVE_SWEEP_COOLDOWN_HOURS,
  AUTO_ARCHIVE_SWEEP_LIMIT,
  DEFAULT_MAINTENANCE_BATCH_SIZE,
  RETRIEVAL_STRENGTH_FLOOR,
  applyRetrievalAccess,
  capReinforcementValue,
  evaluateMemoryPolicy,
  getEffectiveRetrievalStrength,
  getArchiveStaleDays,
  getInitialMemoryStatus,
  memoryOriginDefinitions,
  memoryTypeDefinitions,
  pickStrongerOrigin,
  resolveReinforcedStatus,
} from './policies/memory.policy.js'
import { compareMemoryRank, rankMemories } from './policies/memory-ranking.policy.js'
import { MemoryRepository } from './memory.repository.js'
import { MemoryEventRepository } from './memory-event.repository.js'
import { MemoryRuntimeStateRepository } from './memory-runtime-state.repository.js'
import { cosineSimilarity, getSemanticSourceText, getSourceTextHash, parseEmbedding } from './semantic-search.js'
import type {
  ArchiveStaleMemoriesResult,
  ApplyMemoryResult,
  ContradictMemoryResult,
  DeleteMemoryResult,
  MemoryGetResult,
  MemoryHistoryResult,
  MemoryListResult,
  MaintenanceFlushEntry,
  MaintenancePassResult,
  SearchResult,
} from './dto/memory-result.dto.js'
import type { MemoryEventDto } from './dto/memory-event.dto.js'
import type { LatestMemoryEventSummaryDto, MemoryDto } from './dto/memory.dto.js'
import type { MemoryEntity } from './entities/memory.entity.js'
import type { MemoryOrigin, MemoryType } from './memory.types.js'
import type Database from 'better-sqlite3'
import {
  runtimeMemoryPolicyResource,
  supportingGuidanceResources,
} from '../guidance/guidance-catalog.js'
import type { ScopeRef, ScopeType } from '../common/types/scope-ref.js'

type MemoryServiceDeps = {
  embeddingProvider: EmbeddingProvider
  memoryEmbeddingRepository: MemoryEmbeddingRepository
  memoryRepository: MemoryRepository
  memoryEventRepository: MemoryEventRepository
  memoryRuntimeStateRepository: MemoryRuntimeStateRepository
  policyVersion: string
  db: InstanceType<typeof Database>
}

type ScoredMemory = {
  memory: MemoryEntity
  score: number
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

const parseStoredEventJson = ({
  eventId,
  field,
  value,
}: {
  eventId: string
  field: 'observationJson' | 'sourceJson'
  value: string | null
}): unknown | null => {
  if (value == null) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new AppError('INVALID_EVENT_PAYLOAD', `Stored memory event ${eventId} has invalid ${field}.`)
  }
}

const parseStoredObservation = ({
  eventId,
  observationJson,
}: {
  eventId: string
  observationJson: string
}): MemoryDraftInput | null => {
  const parsedJson = parseStoredEventJson({
    eventId,
    field: 'observationJson',
    value: observationJson,
  })
  const parsed = memoryDraftInputSchema.nullable().safeParse(parsedJson)

  if (!parsed.success) {
    throw new AppError('INVALID_EVENT_OBSERVATION', `Stored memory event ${eventId} has invalid observationJson.`)
  }

  return parsed.data
}

const parseStoredSource = ({
  eventId,
  sourceJson,
}: {
  eventId: string
  sourceJson: string | null
}): ObservationSource | null => {
  const parsedJson = parseStoredEventJson({
    eventId,
    field: 'sourceJson',
    value: sourceJson,
  })
  const parsed = observationSourceSchema.nullable().safeParse(parsedJson)

  if (!parsed.success) {
    throw new AppError('INVALID_EVENT_SOURCE', `Stored memory event ${eventId} has invalid sourceJson.`)
  }

  return parsed.data
}

const validateObservationSource = (source: ObservationSource | null | undefined): ObservationSource | null => {
  if (source == null) {
    return null
  }

  const parsed = observationSourceSchema.safeParse(source)
  if (!parsed.success) {
    throw new AppError('INVALID_EVENT_SOURCE', 'Observation source is invalid.')
  }

  return parsed.data
}

/**
 * Trims and validates a required string field before it reaches persistence.
 */
const ensureNonEmpty = (value: string, code: string, message: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new AppError(code, message)
  }

  return trimmed
}

/**
 * Validates that a type string matches the supported memory taxonomy.
 */
const ensureMemoryType = (value: string): MemoryType => {
  if (memoryTypeDefinitions.some(definition => definition.value === value)) {
    return value as MemoryType
  }

  throw new AppError(
    'INVALID_TYPE',
    'type must be one of procedural, episodic, semantic, preference, or decision.',
  )
}

/**
 * Validates that a source origin matches the supported provenance taxonomy.
 */
const ensureMemoryOrigin = (value: string): MemoryOrigin => {
  if (memoryOriginDefinitions.some(definition => definition.value === value)) {
    return value as MemoryOrigin
  }

  throw new AppError(
    'INVALID_ORIGIN',
    'origin must be one of explicit_user_statement, observed_pattern, or tool_observation.',
  )
}

/**
 * Validates that numeric inputs are positive integers before they affect query or batch sizing.
 */
const ensurePositiveInteger = ({ value, code, message }: { value: number; code: string; message: string }): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(code, message)
  }

  return value
}

/**
 * Normalizes a scope ref to its canonical absolute identifier.
 */
const canonicalizeScope = (scope: ScopeRef): ScopeRef => ({
  type: scope.type,
  id: resolveCanonicalScopeId(scope.type, scope.id),
})

/**
 * Builds the audit reason recorded when a memory is contradicted by a replacement.
 */
const toContradictionReason = ({ replacementMemoryId }: { replacementMemoryId: string }): string =>
  `Memory was contradicted and superseded by ${replacementMemoryId}.`

const SEMANTIC_MIN_SCORE = 0.25

/**
 * Builds the audit reason recorded for the replacement memory created during contradiction.
 */
const toReplacementReason = ({ oldMemoryId }: { oldMemoryId: string }): string =>
  `Memory was created as the active replacement for contradicted memory ${oldMemoryId}.`

/**
 * Removes transport-only provenance from an observation before persisting it in event history.
 */
const toMemoryDraftInput = (input: MemoryDraftInput): MemoryDraftInput => ({
  scope: input.scope,
  type: input.type,
  subject: input.subject,
  statement: input.statement,
  origin: input.origin,
  details: input.details ?? null,
})

/**
 * Formats archive reasons for both operator sweeps and automatic sweeps.
 */
const toArchiveReason = ({
  olderThanDays,
  automatic,
}: {
  olderThanDays: number | null
  automatic: boolean
}): string =>
  olderThanDays == null
    ? automatic
      ? 'Memory was archived automatically after exceeding the scope-aware staleness threshold for reinforcement and retrieval.'
      : 'Memory was archived by operator sweep after exceeding the scope-aware staleness threshold for reinforcement and retrieval.'
    : automatic
      ? `Memory was archived automatically after ${olderThanDays} days without reinforcement or retrieval.`
      : `Memory was archived by operator sweep after ${olderThanDays} days without reinforcement or retrieval.`

/**
 * Returns a UTC timestamp shifted backward by the requested number of days.
 */
const subtractDays = ({ timestamp, days }: { timestamp: string; days: number }): string => {
  const date = new Date(timestamp)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString()
}

/**
 * Checks whether the auto-archive sweep is allowed to run again.
 */
const hasAutoArchiveCooldownExpired = ({
  now,
  lastSweepAt,
}: {
  now: string
  lastSweepAt: string | null
}): boolean => {
  if (!lastSweepAt) {
    return true
  }

  const elapsedMs = new Date(now).getTime() - new Date(lastSweepAt).getTime()
  return elapsedMs >= AUTO_ARCHIVE_SWEEP_COOLDOWN_HOURS * 60 * 60 * 1000
}

type ArchiveStaleMemoriesInput = {
  olderThanDays?: number | null
  dryRun?: boolean
  limit?: number | null
  reason?: string
  source?: ObservationSource | null
  updateSweepTimestamp?: boolean
  deferSweepTimestampWhenTruncated?: boolean
}

type ScopeCutoffMap = Record<ScopeType, string>

const scopeTypes: ScopeType[] = ['user', 'repo', 'org']

/**
 * Normalizes a database event row into the parsed event model used by the API.
 */
const toParsedEvent = (event: {
  id: string
  memoryId: string | null
  eventType: string
  scope: { type: 'user' | 'repo' | 'org'; id: string }
  type: MemoryType
  subjectKey: string
  observationJson: string
  sourceJson: string | null
  reason: string
  createdAt: string
}): MemoryEventDto => ({
  id: event.id,
  memoryId: event.memoryId,
  eventType: event.eventType as MemoryEventDto['eventType'],
  scope: event.scope,
  type: event.type,
  subjectKey: event.subjectKey,
  observation: parseStoredObservation({
    eventId: event.id,
    observationJson: event.observationJson,
  }),
  source: parseStoredSource({
    eventId: event.id,
    sourceJson: event.sourceJson,
  }),
  reason: event.reason,
  createdAt: event.createdAt,
})

/**
 * Maps a persisted event row to the compact provenance summary carried on memory DTOs.
 */
const toLatestMemoryEventSummary = (event: {
  id: string
  eventType: MemoryEventDto['eventType']
  sourceJson: string | null
  createdAt: string
}): LatestMemoryEventSummaryDto => ({
  eventType: event.eventType,
  createdAt: event.createdAt,
  source: parseStoredSource({
    eventId: event.id,
    sourceJson: event.sourceJson,
  }),
})

/**
 * Falls back to hybrid retrieval when the caller does not request a specific search mode.
 */
const toMatchMode = (value: SearchMatchMode | null | undefined): SearchMatchMode => value ?? 'hybrid'

const isSemanticModelUnavailableError = (error: unknown): error is AppError =>
  error instanceof AppError && error.code === 'SEMANTIC_MODEL_NOT_AVAILABLE'

/**
 * Explains why the search path fell back to exact matching only.
 */
const toSearchFallbackReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'unknown error'
  return `Semantic retrieval unavailable; returned exact results only. ${message}`
}

/**
 * Orders exact-search candidates by effective retrieval strength and then stable rank.
 */
const compareSearchMemories = ({
  left,
  right,
  now,
}: {
  left: MemoryEntity
  right: MemoryEntity
  now: string
}): number => {
  const leftStrength = getEffectiveRetrievalStrength({
    strength: left.strength,
    lastRetrievedAt: left.lastRetrievedAt,
    now,
  })
  const rightStrength = getEffectiveRetrievalStrength({
    strength: right.strength,
    lastRetrievedAt: right.lastRetrievedAt,
    now,
  })

  if (rightStrength !== leftStrength) {
    return rightStrength - leftStrength
  }

  return compareMemoryRank(left, right)
}

/**
 * Orders semantic candidates by score first, then by the same retrieval/rank tie-breakers.
 */
const compareScoredMemories = ({
  left,
  right,
  now,
}: {
  left: ScoredMemory
  right: ScoredMemory
  now: string
}): number => {
  if (right.score !== left.score) {
    return right.score - left.score
  }

  return compareSearchMemories({
    left: left.memory,
    right: right.memory,
    now,
  })
}

export class MemoryService {
  private readonly deps: MemoryServiceDeps

  constructor(deps: MemoryServiceDeps) {
    this.deps = deps
  }

  /**
   * Hydrates memory rows with their latest event provenance summary.
   */
  private enrichMemoryDtos(memories: MemoryEntity[]): MemoryDto[] {
    if (memories.length === 0) {
      return []
    }

    const latestEvents = this.deps.memoryEventRepository.listLatestByMemoryIds(memories.map(memory => memory.id))
    const latestEventSummaries = new Map(
      latestEvents
        .filter(event => event.memoryId != null)
        .map(event => [event.memoryId, toLatestMemoryEventSummary(event)] as const),
    )

    return memories.map(memory => ({
      ...memory,
      latestEventSummary: latestEventSummaries.get(memory.id) ?? null,
    }))
  }

  /**
   * Expands a memory response so contradicted memories include their replacement record.
   */
  private createMemoryGetResult(memory: MemoryEntity): MemoryGetResult {
    if (!memory.supersededBy) {
      const [memoryDto] = this.enrichMemoryDtos([memory])
      return {
        ...memoryDto,
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

    const [memoryDto, supersededByMemoryDto] = this.enrichMemoryDtos([memory, supersededByMemory])

    return {
      ...memoryDto,
      supersededByMemory: supersededByMemoryDto,
    }
  }

  /**
   * Loads a memory and rejects edits when it has already been deleted or superseded.
   */
  private assertMemoryEditable(id: string): MemoryEntity {
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
    return memory
  }

  /**
   * Triggers a bounded stale-memory sweep when the runtime cooldown has expired.
   */
  private maybeArchiveStaleMemories(): void {
    const now = new Date().toISOString()
    const lastSweepAt = this.deps.memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()

    if (!hasAutoArchiveCooldownExpired({ now, lastSweepAt })) {
      return
    }

    this.archiveStaleMemories({
      dryRun: false,
      limit: AUTO_ARCHIVE_SWEEP_LIMIT,
      reason: toArchiveReason({
        olderThanDays: null,
        automatic: true,
      }),
      source: null,
      updateSweepTimestamp: true,
      deferSweepTimestampWhenTruncated: true,
    })
  }

  /**
   * Flushes decay-adjusted retrieval strength for a bounded maintenance batch.
   */
  runMaintenance(input: {
    scope?: ScopeRef | null
    batchSize?: number | null
    dryRun?: boolean
  }): MaintenancePassResult {
    const batchSize = ensurePositiveInteger({
      value: input.batchSize ?? DEFAULT_MAINTENANCE_BATCH_SIZE,
      code: 'INVALID_BATCH_SIZE',
      message: 'batchSize must be a positive integer.',
    })
    const dryRun = input.dryRun ?? false
    const scope = input.scope ? canonicalizeScope(validateScope(input.scope)) : null
    const now = new Date().toISOString()

    const candidates = this.deps.memoryRepository.listForMaintenance({
      scope,
      floor: RETRIEVAL_STRENGTH_FLOOR,
      limit: batchSize,
    })

    const flushed: MaintenanceFlushEntry[] = []
    let unchanged = 0

    const shouldFlushStrength = (stored: number, effective: number): boolean =>
      // Flush when decay is meaningful OR when effective has hit the floor and the stored
      // value is still above it — ensures near-floor rows are evicted from future batches.
      effective - stored < -0.001 || (effective === RETRIEVAL_STRENGTH_FLOOR && stored > RETRIEVAL_STRENGTH_FLOOR)

    if (dryRun) {
      for (const memory of candidates) {
        const effective = getEffectiveRetrievalStrength({
          strength: memory.strength,
          lastRetrievedAt: memory.lastRetrievedAt,
          now,
        })

        if (shouldFlushStrength(memory.strength, effective)) {
          flushed.push({
            id: memory.id,
            scope: memory.scope,
            type: memory.type,
            subject: memory.subject,
            oldStrength: memory.strength,
            newStrength: effective,
          })
        } else {
          unchanged += 1
        }
      }
    } else {
      runTransaction(this.deps.db, () => {
        for (const memory of candidates) {
          const effective = getEffectiveRetrievalStrength({
            strength: memory.strength,
            lastRetrievedAt: memory.lastRetrievedAt,
            now,
          })

          if (shouldFlushStrength(memory.strength, effective)) {
            this.deps.memoryRepository.flushStrength({ id: memory.id, strength: effective, now })
            flushed.push({
              id: memory.id,
              scope: memory.scope,
              type: memory.type,
              subject: memory.subject,
              oldStrength: memory.strength,
              newStrength: effective,
            })
          } else {
            unchanged += 1
          }
        }
      })
    }

    return {
      dryRun,
      batchSize,
      flushed,
      unchanged,
      total: flushed.length + unchanged,
    }
  }

  /**
   * Archives memories that are stale for their scope, optionally as a dry run.
   */
  archiveStaleMemories(input: ArchiveStaleMemoriesInput = {}): ArchiveStaleMemoriesResult {
    const olderThanDays =
      input.olderThanDays == null
        ? null
        : ensurePositiveInteger({
            value: input.olderThanDays,
            code: 'INVALID_OLDER_THAN_DAYS',
            message: 'olderThanDays must be a positive integer.',
          })
    const dryRun = input.dryRun ?? false
    const limit =
      input.limit == null
        ? null
        : ensurePositiveInteger({
            value: input.limit,
            code: 'INVALID_LIMIT',
            message: 'Limit must be a positive integer.',
          })
    const now = new Date().toISOString()
    const cutoffByScope = scopeTypes.reduce<ScopeCutoffMap>(
      (acc, scopeType) => {
        acc[scopeType] = subtractDays({
          timestamp: now,
          days: olderThanDays ?? getArchiveStaleDays(scopeType),
        })
        return acc
      },
      {
        user: now,
        repo: now,
        org: now,
      },
    )
    const reason =
      input.reason ??
      toArchiveReason({
        olderThanDays,
        automatic: false,
      })
    const queryLimit =
      input.deferSweepTimestampWhenTruncated && limit != null ? limit + 1 : limit

    if (dryRun) {
      const items = this.deps.memoryRepository.listStaleMemories({
        cutoffByScope,
        limit,
      })

      return {
        dryRun,
        olderThanDays,
        cutoffByScope,
        items: this.enrichMemoryDtos(items),
        total: items.length,
      }
    }

    return runTransaction(this.deps.db, () => {
      const staleMemories = this.deps.memoryRepository.listStaleMemories({
        cutoffByScope,
        limit: queryLimit,
      })
      const hasMoreStaleMemories = limit != null && staleMemories.length > limit
      const memoriesToArchive = hasMoreStaleMemories ? staleMemories.slice(0, limit) : staleMemories
      const archivedMemories: MemoryEntity[] = []

      for (const staleMemory of memoriesToArchive) {
        const normalizedStrength = getEffectiveRetrievalStrength({
          strength: staleMemory.strength,
          lastRetrievedAt: staleMemory.lastRetrievedAt,
          now,
        })

        if (normalizedStrength !== staleMemory.strength) {
          this.deps.memoryRepository.updateRetrievalState({
            memory: staleMemory,
            retrievalCount: staleMemory.retrievalCount,
            lastRetrievedAt: staleMemory.lastRetrievedAt,
            strength: normalizedStrength,
            now,
          })
        }

        const archivedMemory = this.deps.memoryRepository.archiveMemoryIfLive({
          id: staleMemory.id,
          now,
        })

        if (!archivedMemory) {
          continue
        }

        this.deps.memoryEventRepository.insert({
          memoryId: archivedMemory.id,
          eventType: 'archived',
          scope: archivedMemory.scope,
          type: archivedMemory.type,
          subjectKey: archivedMemory.subjectKey,
          observation: null,
          source: input.source ?? null,
          reason,
          now,
        })

        archivedMemories.push(archivedMemory)
      }

      if ((input.updateSweepTimestamp ?? true) && !hasMoreStaleMemories) {
        this.deps.memoryRuntimeStateRepository.setLastAutoArchiveSweepAt(now)
      }

      return {
        dryRun,
        olderThanDays,
        cutoffByScope,
        items: this.enrichMemoryDtos(archivedMemories),
        total: archivedMemories.length,
      }
    })
  }

  /**
   * Refreshes the cached embedding for a memory when its source text or model fingerprint changes.
   */
  private async ensureMemoryEmbedding(memory: MemoryEntity, modelFingerprint: string): Promise<number[]> {
    const sourceText = getSemanticSourceText(memory)
    const sourceTextHash = getSourceTextHash(sourceText)
    const existing = this.deps.memoryEmbeddingRepository.getByMemoryId(memory.id)

    if (
      existing &&
      existing.modelId === this.deps.embeddingProvider.getModelId() &&
      existing.modelFingerprint === modelFingerprint &&
      existing.sourceTextHash === sourceTextHash
    ) {
      return parseEmbedding(existing.embeddingJson)
    }

    const embedding = await this.deps.embeddingProvider.embed(sourceText)

    this.deps.memoryEmbeddingRepository.upsert({
      memoryId: memory.id,
      modelId: this.deps.embeddingProvider.getModelId(),
      modelFingerprint,
      embeddingJson: JSON.stringify(embedding),
      sourceTextHash,
      updatedAt: new Date().toISOString(),
    })

    return embedding
  }

  /**
   * Scores semantic candidates using FTS shortcuts when possible, otherwise falls back to a full scan.
   */
  private async searchBySemanticSimilarity(input: {
    scope: ScopeRef
    type: MemoryType | null
    query: string
    queryEmbedding: number[]
    now: string
  }): Promise<MemoryEntity[]> {
    try {
      const candidates = this.deps.memoryRepository.listFtsCandidates({
        scope: input.scope,
        type: input.type,
        query: input.query,
      })
      if (candidates.length === 0) {
        return this.searchBySemanticSimilarityFromFullScan(input)
      }

      const activeCount = this.deps.memoryRepository.countActive({
        scope: input.scope,
        type: input.type,
      })

      if (candidates.length === activeCount) {
        return this.scoreSemanticCandidates({
          candidates,
          queryEmbedding: input.queryEmbedding,
          now: input.now,
        })
      }
    } catch {
      // Fall through to the exhaustive scan.
    }

    return this.searchBySemanticSimilarityFromFullScan(input)
  }

  /**
   * Scores every candidate memory when the FTS shortcut is not sufficient.
   */
  private async searchBySemanticSimilarityFromFullScan(input: {
    scope: ScopeRef
    type: MemoryType | null
    queryEmbedding: number[]
    now: string
  }): Promise<MemoryEntity[]> {
    const candidates = this.deps.memoryRepository.list({
      scope: input.scope,
      type: input.type,
      limit: null,
    })

    if (candidates.length === 0) {
      return []
    }

    return this.scoreSemanticCandidates({
      candidates,
      queryEmbedding: input.queryEmbedding,
      now: input.now,
    })
  }

  /**
   * Computes cosine similarity for each candidate and returns the surviving set in rank order.
   */
  private async scoreSemanticCandidates(input: {
    candidates: MemoryEntity[]
    queryEmbedding: number[]
    now: string
  }): Promise<MemoryEntity[]> {
    const modelFingerprint = await this.deps.embeddingProvider.getModelFingerprint()
    const embeddings = await Promise.all(
      input.candidates.map(candidate => this.ensureMemoryEmbedding(candidate, modelFingerprint)),
    )

    const scored: ScoredMemory[] = input.candidates
      .map((memory, i) => ({ memory, score: cosineSimilarity(input.queryEmbedding, embeddings[i]) }))
      .filter(item => item.score >= SEMANTIC_MIN_SCORE)

    return scored
      .sort((left, right) =>
        compareScoredMemories({
          left,
          right,
          now: input.now,
        }),
      )
      .map(item => item.memory)
  }

  /**
   * Warms the embedding cache asynchronously without blocking the calling write path.
   */
  private scheduleEagerEmbedding(memory: MemoryEntity): void {
    globalThis.queueMicrotask(() => {
      void (async () => {
        try {
          const modelFingerprint = await this.deps.embeddingProvider.getModelFingerprint()
          await this.ensureMemoryEmbedding(memory, modelFingerprint)
        } catch {
          // Best-effort cache warming only.
        }
      })()
    })
  }

  /**
   * Returns exact-search matches ordered by effective retrieval strength and stable rank.
   */
  private getExactSearchItems(input: {
    scope: ScopeRef
    type: MemoryType | null
    subject: string
    now: string
  }): MemoryEntity[] {
    return this.deps.memoryRepository
      .search({
        scope: input.scope,
        type: input.type,
        subject: input.subject,
      })
      .sort((left, right) =>
        compareSearchMemories({
          left,
          right,
          now: input.now,
        }),
      )
  }

  /**
   * Applies retrieval bookkeeping to the items returned from a search result page.
   */
  private persistSearchRetrievalState(items: MemoryEntity[], now: string): MemoryEntity[] {
    if (items.length === 0) {
      return items
    }

    return runTransaction(this.deps.db, () =>
      items.map(memory => {
        const nextRetrievalState = applyRetrievalAccess({
          retrievalCount: memory.retrievalCount,
          lastRetrievedAt: memory.lastRetrievedAt,
          strength: memory.strength,
          now,
        })

        return this.deps.memoryRepository.updateRetrievalState({
          memory,
          retrievalCount: nextRetrievalState.retrievalCount,
          lastRetrievedAt: nextRetrievalState.lastRetrievedAt,
          strength: nextRetrievalState.strength,
          now,
        })
      }),
    )
  }

  /**
   * Decides whether an observation should create, reinforce, or be rejected as a memory.
   */
  applyObservation(input: ApplyObservationInput): ApplyMemoryResult {
    const scope = canonicalizeScope(validateScope(input.scope))
    const type = ensureMemoryType(ensureNonEmpty(input.type, 'INVALID_TYPE', 'Observation type must not be empty.'))
    const statement = ensureNonEmpty(input.statement, 'INVALID_STATEMENT', 'Observation statement must not be empty.')
    const origin = ensureMemoryOrigin(input.origin)
    const subjectKey = normalizeSubject(input.subject)
    const source = validateObservationSource(input.source)

    this.maybeArchiveStaleMemories()

    const now = new Date().toISOString()

    const existing = subjectKey ? this.deps.memoryRepository.findSimilar(scope, type, subjectKey) : null
    const decision = evaluateMemoryPolicy({
      policyVersion: this.deps.policyVersion,
      subjectKey,
      existingMemory: existing !== null,
    })

    const result: ApplyMemoryResult = runTransaction(this.deps.db, () => {
      if (decision.decision === 'reject') {
        this.deps.memoryEventRepository.insert({
          eventType: 'rejected',
          scope,
          type,
          subjectKey,
          observation: toMemoryDraftInput(input),
          source,
          reason: decision.reason,
          now,
        })

        return decision
      }

      if (decision.decision === 'create') {
        const status = getInitialMemoryStatus(origin)
        const memory = this.deps.memoryRepository.insert({
          scope,
          type,
          subject: input.subject.trim(),
          subjectKey,
          statement,
          details: input.details?.trim() ?? null,
          origin,
          status,
          policyVersion: this.deps.policyVersion,
          now,
        })

        this.deps.memoryEventRepository.insert({
          memoryId: memory.id,
          eventType: 'created',
          scope,
          type: memory.type,
          subjectKey,
          observation: toMemoryDraftInput(input),
          source,
          reason: decision.reason,
          now,
        })

        return {
          decision: 'create' as const,
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
        origin: pickStrongerOrigin(existing.origin, origin),
        reinforcementCount: capReinforcementValue(existing.reinforcementCount + 1),
        status: resolveReinforcedStatus({
          currentStatus: existing.status,
          nextReinforcementCount: capReinforcementValue(existing.reinforcementCount + 1),
          nextOrigin: pickStrongerOrigin(existing.origin, origin),
        }),
        policyVersion: this.deps.policyVersion,
        now,
      })

      this.deps.memoryEventRepository.insert({
        memoryId: memory.id,
        eventType: 'reinforced',
        scope,
        type: memory.type,
        subjectKey,
        observation: toMemoryDraftInput(input),
        source,
        reason: decision.reason,
        now,
      })

      return {
        decision: 'reinforce' as const,
        reason: decision.reason,
        policyVersion: decision.policyVersion,
        memory,
      }
    })

    if ('memory' in result) {
      const memory = result.memory as MemoryEntity
      this.scheduleEagerEmbedding(memory)

      return {
        ...result,
        memory: this.enrichMemoryDtos([memory])[0]!,
      } as ApplyMemoryResult
    }

    return result
  }

  /**
   * Runs exact or hybrid retrieval and persists access state for returned memories.
   */
  async searchMemories(input: SearchMemoriesInput): Promise<SearchResult> {
    const limit = toPositiveLimit(input.limit)
    const scope = canonicalizeScope(validateScope(input.scope))
    const requestedMatchMode = toMatchMode(input.matchMode)
    const type = input.type == null ? null : ensureMemoryType(input.type)
    const semanticQuery = ensureNonEmpty(input.subject, 'INVALID_SEARCH_SUBJECT', 'subject must not be empty for memory-search.')
    const subject = normalizeSubject(semanticQuery)
    const now = new Date().toISOString()

    if (requestedMatchMode === 'exact') {
      this.maybeArchiveStaleMemories()

      const exactItems = this.getExactSearchItems({
        scope,
        type,
        subject,
        now,
      })
      const finalItems = exactItems.slice(0, limit)
      const returnedItems = this.persistSearchRetrievalState(finalItems, now)

      return {
        items: this.enrichMemoryDtos(returnedItems),
        total: exactItems.length,
        matchMode: 'exact',
        requestedMatchMode: 'exact',
        effectiveMatchMode: 'exact',
      }
    }

    let queryEmbedding: number[]

    try {
      queryEmbedding = await this.deps.embeddingProvider.embed(semanticQuery)
    } catch (error) {
      if (!isSemanticModelUnavailableError(error)) {
        throw error
      }

      this.maybeArchiveStaleMemories()

      const exactItems = this.getExactSearchItems({
        scope,
        type,
        subject,
        now,
      })
      const finalItems = exactItems.slice(0, limit)
      const returnedItems = this.persistSearchRetrievalState(finalItems, now)

      return {
        items: this.enrichMemoryDtos(returnedItems),
        total: exactItems.length,
        matchMode: 'exact',
        requestedMatchMode,
        effectiveMatchMode: 'exact',
        fallbackReason: toSearchFallbackReason(error),
      }
    }

    this.maybeArchiveStaleMemories()

    const exactItems = this.getExactSearchItems({
      scope,
      type,
      subject,
      now,
    })
    const semanticItems = await this.searchBySemanticSimilarity({
      scope,
      type,
      query: semanticQuery,
      queryEmbedding,
      now,
    })
    const items = [...exactItems, ...semanticItems.filter(memory => !exactItems.some(item => item.id === memory.id))]
    const finalItems = items.slice(0, limit)
    const returnedItems = this.persistSearchRetrievalState(finalItems, now)

    return {
      items: this.enrichMemoryDtos(returnedItems),
      total: items.length,
      matchMode: 'hybrid',
      requestedMatchMode: 'hybrid',
      effectiveMatchMode: 'hybrid',
    }
  }

  /**
   * Returns the highest-ranked memories for a scope after applying maintenance.
   */
  listMemories(input: ListMemoriesInput): MemoryListResult {
    const limit = toPositiveLimit(input.limit)
    const scope = canonicalizeScope(validateScope(input.scope))

    this.maybeArchiveStaleMemories()

    const items = rankMemories(
      this.deps.memoryRepository.list({
        scope,
        type: input.type == null ? null : ensureMemoryType(input.type),
        limit: null,
      }),
    )

    return {
      items: this.enrichMemoryDtos(items.slice(0, limit)),
      total: items.length,
    }
  }

  /**
   * Loads a single memory by id and expands contradiction metadata when present.
   */
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

  /**
   * Returns the parsed event history for a memory.
   */
  getMemoryHistory(input: MemoryIdInput): MemoryHistoryResult {
    const memory = this.getMemory(input)
    const items = this.deps.memoryEventRepository.listByMemoryId(memory.id).map(toParsedEvent)

    return {
      items,
      total: items.length,
    }
  }

  /**
   * Soft-deletes a memory and records a deletion event in the same transaction.
   */
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
        type: deletedMemory.type,
        subjectKey: deletedMemory.subjectKey,
        observation: null,
        source: input.source ?? null,
        reason: 'Memory was soft deleted.',
        now,
      })

      return {
        memory: this.enrichMemoryDtos([deletedMemory])[0]!,
        event: toParsedEvent(event),
      }
    })
  }

  /**
   * Suppresses the current memory and creates a scoped replacement record.
   */
  contradictMemory(input: ContradictMemoryInput): ContradictMemoryResult {
    const id = input.id.trim()
    if (!id) {
      throw new AppError('INVALID_MEMORY_ID', 'Memory id must not be empty.')
    }

    const memory = this.assertMemoryEditable(id)

    const replacementScope = canonicalizeScope(validateScope(input.replacement.scope))
    if (replacementScope.type !== memory.scope.type || replacementScope.id !== memory.scope.id) {
      throw new AppError('INVALID_REPLACEMENT_SCOPE', 'Replacement memory must keep the same scope as the contradicted memory.')
    }

    const replacementType = ensureMemoryType(
      ensureNonEmpty(input.replacement.type, 'INVALID_TYPE', 'Replacement type must not be empty.'),
    )

    const replacementStatement = ensureNonEmpty(
      input.replacement.statement,
      'INVALID_STATEMENT',
      'Replacement statement must not be empty.',
    )
    const replacementOrigin = ensureMemoryOrigin(input.replacement.origin)
    const replacementSubjectKey = normalizeSubject(input.replacement.subject)
    const source = validateObservationSource(input.source)
    if (!replacementSubjectKey) {
      throw new AppError('INVALID_SUBJECT', 'Replacement subject is empty after normalization.')
    }

    this.maybeArchiveStaleMemories()

    const currentMemory = this.assertMemoryEditable(id)

    const now = new Date().toISOString()

    const existing = replacementSubjectKey
      ? this.deps.memoryRepository.findSimilar(replacementScope, replacementType, replacementSubjectKey)
      : null
    if (existing && existing.id !== currentMemory.id) {
      throw new AppError(
        'REPLACEMENT_MEMORY_ALREADY_EXISTS',
        `Active or candidate replacement already exists for subject ${input.replacement.subject.trim()}.`,
      )
    }

    return runTransaction(this.deps.db, () => {
      const replacementMemoryId = randomUUID()
      const suppressedMemory = this.deps.memoryRepository.suppress({
        memory: currentMemory,
        now,
      })

      const replacementMemory = this.deps.memoryRepository.insert({
        id: replacementMemoryId,
        scope: replacementScope,
        type: replacementType,
        subject: input.replacement.subject.trim(),
        subjectKey: replacementSubjectKey,
        statement: replacementStatement,
        details: input.replacement.details?.trim() ?? null,
        origin: replacementOrigin,
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
        type: contradictedMemory.type,
        subjectKey: contradictedMemory.subjectKey,
        observation: toMemoryDraftInput(input.replacement),
        source,
        reason: toContradictionReason({
          replacementMemoryId: replacementMemory.id,
        }),
        now,
      })

      const replacementEvent = this.deps.memoryEventRepository.insert({
        memoryId: replacementMemory.id,
        eventType: 'created',
        scope: replacementMemory.scope,
        type: replacementMemory.type,
        subjectKey: replacementMemory.subjectKey,
        observation: toMemoryDraftInput(input.replacement),
        source,
        reason: toReplacementReason({
          oldMemoryId: contradictedMemory.id,
        }),
        now,
      })

      const [contradictedMemoryDto, replacementMemoryDto] = this.enrichMemoryDtos([
        contradictedMemory,
        replacementMemory,
      ])

      return {
        contradictedMemory: contradictedMemoryDto,
        replacementMemory: replacementMemoryDto,
        contradictedEvent: toParsedEvent(contradictedEvent),
        replacementEvent: toParsedEvent(replacementEvent),
      }
    })
  }

  /**
   * Returns the canonical runtime guidance resources exposed to MCP clients.
   */
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
        'Canonical policy resources for Hippocampus runtime behavior. Read the returned resource URIs for retrieval, saving, scope, ranking, and contradiction guidance.',
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
