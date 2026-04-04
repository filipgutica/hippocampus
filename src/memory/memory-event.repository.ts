import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { AppError } from '../common/errors.js'
import type { ScopeRef } from '../common/types/scope-ref.js'
import {
  memoryDraftInputSchema,
  observationSourceSchema,
  type MemoryDraftInput,
  type ObservationSource,
} from './dto/apply-observation.dto.js'
import type { MemoryEventEntity } from './entities/memory-event.entity.js'
import type { MemoryEventType, MemoryType } from './memory.types.js'

type EventInsertInput = {
  memoryId?: string | null
  eventType: MemoryEventType
  scope: ScopeRef
  type: MemoryType
  subjectKey: string
  observation?: MemoryDraftInput | null
  source?: ObservationSource | null
  reason: string
  now: string
}

type EventRow = {
  id: string
  memory_id: string | null
  event_type: MemoryEventType
  scope_type: ScopeRef['type']
  scope_id: string
  memory_type: MemoryType
  subject_key: string
  observation_json: string
  source_json: string | null
  reason: string
  created_at: string
}

type LatestEventRow = EventRow & {
  row_number: number
}

const toRecord = (row: EventRow): MemoryEventEntity => ({
  id: row.id,
  memoryId: row.memory_id,
  eventType: row.event_type,
  scope: {
    type: row.scope_type,
    id: row.scope_id,
  },
  type: row.memory_type,
  subjectKey: row.subject_key,
  observationJson: row.observation_json,
  sourceJson: row.source_json,
  reason: row.reason,
  createdAt: row.created_at,
})

const assertValidObservation = ({
  observation,
  eventType,
}: {
  observation: MemoryDraftInput | null
  eventType: MemoryEventType
}): MemoryDraftInput | null => {
  if (observation == null) {
    return null
  }

  const parsed = memoryDraftInputSchema.safeParse(observation)
  if (!parsed.success) {
    throw new AppError('INVALID_EVENT_OBSERVATION', `Memory event ${eventType} has invalid observation payload.`)
  }

  return parsed.data
}

const assertValidSource = ({
  source,
  eventType,
}: {
  source: ObservationSource | null
  eventType: MemoryEventType
}): ObservationSource | null => {
  if (source == null) {
    return null
  }

  const parsed = observationSourceSchema.safeParse(source)
  if (!parsed.success) {
    throw new AppError('INVALID_EVENT_SOURCE', `Memory event ${eventType} has invalid source payload.`)
  }

  return parsed.data
}

export class MemoryEventRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  insert(input: EventInsertInput): MemoryEventEntity {
    const id = randomUUID()
    const observation = assertValidObservation({
      observation: input.observation ?? null,
      eventType: input.eventType,
    })
    const source = assertValidSource({
      source: input.source ?? null,
      eventType: input.eventType,
    })
    const observationJson = JSON.stringify(observation)
    const sourceJson = source ? JSON.stringify(source) : null

    this.db
      .prepare(
        `
          INSERT INTO memory_events (
            id, memory_id, event_type, scope_type, scope_id, memory_type, subject_key,
            observation_json, source_json, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.memoryId ?? null,
        input.eventType,
        input.scope.type,
        input.scope.id,
        input.type,
        input.subjectKey,
        observationJson,
        sourceJson,
        input.reason,
        input.now,
      )

    return {
      id,
      memoryId: input.memoryId ?? null,
      eventType: input.eventType,
      scope: input.scope,
      type: input.type,
      subjectKey: input.subjectKey,
      observationJson,
      sourceJson,
      reason: input.reason,
      createdAt: input.now,
    }
  }

  listByMemoryId(memoryId: string): MemoryEventEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM memory_events
          WHERE memory_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(memoryId) as EventRow[]

    return rows.map(toRecord)
  }

  listLatestByMemoryIds(memoryIds: string[]): MemoryEventEntity[] {
    if (memoryIds.length === 0) {
      return []
    }

    const placeholders = memoryIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM (
            SELECT
              *,
              ROW_NUMBER() OVER (
                PARTITION BY memory_id
                ORDER BY created_at DESC, rowid DESC
              ) AS row_number
            FROM memory_events
            WHERE memory_id IN (${placeholders})
          )
          WHERE row_number = 1
        `,
      )
      .all(...memoryIds) as LatestEventRow[]

    return rows.map(toRecord)
  }
}
