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
  observation: ApplyObservationInput
  source?: ObservationSource | null
  reason: string
  now: string
}

export class MemoryEventRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  insert(input: EventInsertInput): MemoryEventRecord {
    const id = randomUUID()
    const observationJson = JSON.stringify(input.observation)
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
}
