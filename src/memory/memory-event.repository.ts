import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { AppError } from '../common/errors.js'
import { createDrizzleDb } from '../common/db/drizzle.js'
import { memoryEventsTable, type MemoryEventRow } from '../common/db/schema/index.js'
import type { ScopeRef } from '../common/types/scope-ref.js'
import {
  memoryDraftInputSchema,
  observationSourceSchema,
  type MemoryDraftInput,
  type ObservationSource,
} from './dto/apply-observation.dto.js'
import type { MemoryEvent } from './types/memory-event.js'
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

type LatestEventRow = MemoryEventRow & {
  row_number: number
}

const toMemoryEvent = (row: MemoryEventRow): MemoryEvent => ({
  id: row.id,
  memoryId: row.memoryId,
  eventType: row.eventType as MemoryEventType,
  scope: {
    type: row.scopeType as ScopeRef['type'],
    id: row.scopeId,
  },
  type: row.memoryType as MemoryType,
  subjectKey: row.subjectKey,
  observationJson: row.observationJson,
  sourceJson: row.sourceJson,
  reason: row.reason,
  createdAt: row.createdAt,
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
  private readonly drizzleDb

  constructor(db: InstanceType<typeof Database>) {
    this.drizzleDb = createDrizzleDb(db)
  }

  insert(input: EventInsertInput): MemoryEvent {
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

    this.drizzleDb
      .insert(memoryEventsTable)
      .values({
        id,
        memoryId: input.memoryId ?? null,
        eventType: input.eventType,
        scopeType: input.scope.type,
        scopeId: input.scope.id,
        memoryType: input.type,
        subjectKey: input.subjectKey,
        observationJson,
        sourceJson,
        reason: input.reason,
        createdAt: input.now,
      })
      .run()

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

  listByMemoryId(memoryId: string): MemoryEvent[] {
    const rows = this.drizzleDb
      .select({
        id: memoryEventsTable.id,
        memoryId: memoryEventsTable.memoryId,
        eventType: memoryEventsTable.eventType,
        scopeType: memoryEventsTable.scopeType,
        scopeId: memoryEventsTable.scopeId,
        memoryType: memoryEventsTable.memoryType,
        subjectKey: memoryEventsTable.subjectKey,
        observationJson: memoryEventsTable.observationJson,
        sourceJson: memoryEventsTable.sourceJson,
        reason: memoryEventsTable.reason,
        createdAt: memoryEventsTable.createdAt,
      })
      .from(memoryEventsTable)
      .where(eq(memoryEventsTable.memoryId, memoryId))
      .orderBy(memoryEventsTable.createdAt)
      .all() as MemoryEventRow[]

    return rows.map(toMemoryEvent)
  }

  listLatestByMemoryIds(memoryIds: string[]): MemoryEvent[] {
    if (memoryIds.length === 0) {
      return []
    }

    const rowNumber = sql<number>`ROW_NUMBER() OVER (
      PARTITION BY ${memoryEventsTable.memoryId}
      ORDER BY ${memoryEventsTable.createdAt} DESC, rowid DESC
    )`
    const latestEvents = this.drizzleDb
      .select({
        id: memoryEventsTable.id,
        memoryId: memoryEventsTable.memoryId,
        eventType: memoryEventsTable.eventType,
        scopeType: memoryEventsTable.scopeType,
        scopeId: memoryEventsTable.scopeId,
        memoryType: memoryEventsTable.memoryType,
        subjectKey: memoryEventsTable.subjectKey,
        observationJson: memoryEventsTable.observationJson,
        sourceJson: memoryEventsTable.sourceJson,
        reason: memoryEventsTable.reason,
        createdAt: memoryEventsTable.createdAt,
        row_number: rowNumber,
      })
      .from(memoryEventsTable)
      .where(inArray(memoryEventsTable.memoryId, memoryIds))
      .orderBy(desc(memoryEventsTable.createdAt)) as unknown as { all: () => LatestEventRow[] }

    const rows = latestEvents.all().filter(row => row.row_number === 1)

    return rows.map(toMemoryEvent)
  }
}
