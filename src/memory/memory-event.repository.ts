import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ScopeRef } from '../common/types/scope-ref.js'
import type { ApplyObservationInput, ObservationSource } from './dto/apply-observation.dto.js'
import type { MemoryEventRecord } from './models/memory-record.js'
import type { MemoryEventType } from './types/memory.types.js'

type EventInsertInput = {
  memoryId?: string | null
  eventType: MemoryEventType
  scope: ScopeRef
  kind: string
  subjectKey: string
  observation?: ApplyObservationInput | null
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
  kind: string
  subject_key: string
  observation_json: string
  source_json: string | null
  reason: string
  created_at: string
}

const toRecord = (row: EventRow): MemoryEventRecord => ({
  id: row.id,
  memoryId: row.memory_id,
  eventType: row.event_type,
  scope: {
    type: row.scope_type,
    id: row.scope_id,
  },
  kind: row.kind,
  subjectKey: row.subject_key,
  observationJson: row.observation_json,
  sourceJson: row.source_json,
  reason: row.reason,
  createdAt: row.created_at,
})

export class MemoryEventRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  insert(input: EventInsertInput): MemoryEventRecord {
    const id = randomUUID()
    const observationJson = JSON.stringify(input.observation ?? null)
    const sourceJson = input.source ? JSON.stringify(input.source) : null

    this.db
      .prepare(
        `
          INSERT INTO memory_events (
            id, memory_id, event_type, scope_type, scope_id, kind, subject_key,
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
        input.kind,
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
      kind: input.kind,
      subjectKey: input.subjectKey,
      observationJson,
      sourceJson,
      reason: input.reason,
      createdAt: input.now,
    }
  }

  listByMemoryId(memoryId: string): MemoryEventRecord[] {
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
}
