import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ScopeRef } from '../common/types/scope-ref.js'
import type { MemoryRecord } from './models/memory-record.js'
import type { MemorySourceType, MemoryStatus } from './types/memory.types.js'

type MemoryRow = {
  id: string
  scope_type: string
  scope_id: string
  kind: string
  subject: string
  subject_key: string
  statement: string
  details: string | null
  source_type: MemorySourceType
  reinforcement_count: number
  policy_version: string
  created_at: string
  updated_at: string
  last_observed_at?: string
  last_reinforced_at: string
  retrieval_count: number
  last_retrieved_at: string | null
  strength: number
  status: MemoryStatus
  superseded_by: string | null
  deleted_at: string | null
}

const toRecord = (row: MemoryRow): MemoryRecord => ({
  id: row.id,
  scope: { type: row.scope_type as ScopeRef['type'], id: row.scope_id },
  kind: row.kind,
  subject: row.subject,
  subjectKey: row.subject_key,
  statement: row.statement,
  details: row.details,
  sourceType: row.source_type,
  reinforcementCount: row.reinforcement_count,
  policyVersion: row.policy_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastReinforcedAt: row.last_reinforced_at || row.last_observed_at || row.updated_at,
  retrievalCount: row.retrieval_count,
  lastRetrievedAt: row.last_retrieved_at,
  strength: row.strength,
  status: row.status,
  supersededBy: row.superseded_by,
  deletedAt: row.deleted_at,
})

export class MemoryRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  findSimilar(scope: ScopeRef, kind: string, subjectKey: string): MemoryRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM memories
          WHERE scope_type = ? AND scope_id = ? AND kind = ? AND subject_key = ? AND status IN ('candidate', 'active')
          LIMIT 1
        `,
      )
      .get(scope.type, scope.id, kind, subjectKey) as MemoryRow | undefined

    return row ? toRecord(row) : null
  }

  insert(input: {
    id?: string
    scope: ScopeRef
    kind: string
    subject: string
    subjectKey: string
    statement: string
    details?: string | null
    sourceType: MemorySourceType
    status: MemoryStatus
    policyVersion: string
    reinforcementCount?: number
    retrievalCount?: number
    lastRetrievedAt?: string | null
    strength?: number
    supersededBy?: string | null
    now: string
  }): MemoryRecord {
    const id = input.id ?? randomUUID()
    const reinforcementCount = input.reinforcementCount ?? 1
    const retrievalCount = input.retrievalCount ?? 0
    const lastRetrievedAt = input.lastRetrievedAt ?? null
    const strength = input.strength ?? 1

    this.db
      .prepare(
        `
          INSERT INTO memories (
            id, scope_type, scope_id, kind, subject, subject_key, statement, details,
            source_type, reinforcement_count, policy_version, created_at, updated_at, last_observed_at, last_reinforced_at,
            retrieval_count, last_retrieved_at, strength, status, superseded_by, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.scope.type,
        input.scope.id,
        input.kind,
        input.subject,
        input.subjectKey,
        input.statement,
        input.details ?? null,
        input.sourceType,
        reinforcementCount,
        input.policyVersion,
        input.now,
        input.now,
        input.now,
        input.now,
        retrievalCount,
        lastRetrievedAt,
        strength,
        input.status,
        input.supersededBy ?? null,
        null,
      )

    return {
      id,
      scope: input.scope,
      kind: input.kind,
      subject: input.subject,
      subjectKey: input.subjectKey,
      statement: input.statement,
      details: input.details ?? null,
      sourceType: input.sourceType,
      reinforcementCount,
      policyVersion: input.policyVersion,
      createdAt: input.now,
      updatedAt: input.now,
      lastReinforcedAt: input.now,
      retrievalCount,
      lastRetrievedAt,
      strength,
      status: input.status,
      supersededBy: input.supersededBy ?? null,
      deletedAt: null,
    }
  }

  reinforce(input: {
    memory: MemoryRecord
    statement: string
    details?: string | null
    sourceType: MemorySourceType
    status: MemoryStatus
    reinforcementCount: number
    policyVersion: string
    now: string
  }): MemoryRecord {
    const next = {
      ...input.memory,
      statement: input.statement,
      details: input.details ?? input.memory.details,
      sourceType: input.sourceType,
      reinforcementCount: input.reinforcementCount,
      policyVersion: input.policyVersion,
      updatedAt: input.now,
      lastReinforcedAt: input.now,
      status: input.status,
      supersededBy: null,
      deletedAt: null,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET statement = ?, details = ?, source_type = ?, reinforcement_count = ?, policy_version = ?, updated_at = ?, last_observed_at = ?, last_reinforced_at = ?, status = ?, superseded_by = NULL, deleted_at = NULL
          WHERE id = ?
        `,
      )
      .run(
        next.statement,
        next.details,
        next.sourceType,
        next.reinforcementCount,
        next.policyVersion,
        next.updatedAt,
        next.lastReinforcedAt,
        next.lastReinforcedAt,
        next.status,
        next.id,
      )

    return next
  }

  search(input: {
    scope: ScopeRef
    kind?: string | null
    subject?: string | null
  }): MemoryRecord[] {
    const clauses = ['scope_type = ?', 'scope_id = ?', "status = 'active'"]
    const params: Array<string> = [input.scope.type, input.scope.id]

    if (input.kind) {
      clauses.push('kind = ?')
      params.push(input.kind)
    }

    if (input.subject) {
      clauses.push('subject_key = ?')
      params.push(input.subject)
    }

    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE ${clauses.join(' AND ')}`)
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  list(input: {
    scope: ScopeRef
    kind?: string | null
    limit?: number | null
  }): MemoryRecord[] {
    const clauses = ['scope_type = ?', 'scope_id = ?', "status = 'active'"]
    const params: Array<string | number> = [input.scope.type, input.scope.id]

    if (input.kind) {
      clauses.push('kind = ?')
      params.push(input.kind)
    }

    const limitClause = input.limit != null ? ' LIMIT ?' : ''
    if (input.limit != null) {
      params.push(input.limit)
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE ${clauses.join(' AND ')}${limitClause}`,
      )
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  listStaleMemories(input: {
    cutoffAt: string
    limit?: number | null
  }): MemoryRecord[] {
    const params: Array<string | number> = [input.cutoffAt]
    const limitClause = input.limit != null ? ' LIMIT ?' : ''

    if (input.limit != null) {
      params.push(input.limit)
    }

    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM memories
          WHERE status IN ('candidate', 'active') AND last_reinforced_at <= ?
          ORDER BY last_reinforced_at ASC, created_at ASC
          ${limitClause}
        `,
      )
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  getById(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ? LIMIT 1').get(id) as MemoryRow | undefined

    return row ? toRecord(row) : null
  }

  softDelete(input: {
    memory: MemoryRecord
    now: string
  }): MemoryRecord {
    const next: MemoryRecord = {
      ...input.memory,
      status: 'deleted',
      updatedAt: input.now,
      deletedAt: input.now,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET status = 'deleted', deleted_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(next.deletedAt, next.updatedAt, next.id)

    return next
  }

  archiveMemoryIfLive(input: {
    id: string
    now: string
  }): MemoryRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE memories
          SET status = 'archived', updated_at = ?
          WHERE id = ? AND status IN ('candidate', 'active')
        `,
      )
      .run(input.now, input.id)

    if (result.changes === 0) {
      return null
    }

    const archived = this.getById(input.id)
    if (!archived) {
      throw new Error(`Expected archived memory ${input.id} to exist after update.`)
    }

    return archived
  }

  updateRetrievalState(input: {
    memory: MemoryRecord
    retrievalCount: number
    lastRetrievedAt: string | null
    strength: number
    now: string
  }): MemoryRecord {
    const next: MemoryRecord = {
      ...input.memory,
      retrievalCount: input.retrievalCount,
      lastRetrievedAt: input.lastRetrievedAt,
      strength: input.strength,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET retrieval_count = ?, last_retrieved_at = ?, strength = ?
          WHERE id = ?
        `,
      )
      .run(next.retrievalCount, next.lastRetrievedAt, next.strength, next.id)

    return next
  }

  suppress(input: {
    memory: MemoryRecord
    now: string
  }): MemoryRecord {
    const next: MemoryRecord = {
      ...input.memory,
      status: 'suppressed',
      updatedAt: input.now,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET status = 'suppressed', updated_at = ?
          WHERE id = ?
        `,
      )
      .run(next.updatedAt, next.id)

    return next
  }

  setSupersededBy(input: {
    memory: MemoryRecord
    supersededBy: string
    now: string
  }): MemoryRecord {
    const next: MemoryRecord = {
      ...input.memory,
      supersededBy: input.supersededBy,
      updatedAt: input.now,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET superseded_by = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(next.supersededBy, next.updatedAt, next.id)

    return next
  }
}
