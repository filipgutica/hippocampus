import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ScopeRef } from '../common/types/scope-ref.js'
import type { MemoryRecord } from './models/memory-record.js'
import type { MemoryStatus } from './types/memory.types.js'

type MemoryRow = {
  id: string
  scope_type: string
  scope_id: string
  kind: string
  subject: string
  subject_key: string
  statement: string
  details: string | null
  confidence: number
  reinforcement_count: number
  policy_version: string
  created_at: string
  updated_at: string
  last_observed_at: string
  status: MemoryStatus
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
  confidence: row.confidence,
  reinforcementCount: row.reinforcement_count,
  policyVersion: row.policy_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastObservedAt: row.last_observed_at,
  status: row.status,
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
          WHERE scope_type = ? AND scope_id = ? AND kind = ? AND subject_key = ? AND status = 'active'
          LIMIT 1
        `,
      )
      .get(scope.type, scope.id, kind, subjectKey) as MemoryRow | undefined

    return row ? toRecord(row) : null
  }

  insert(input: {
    scope: ScopeRef
    kind: string
    subject: string
    subjectKey: string
    statement: string
    details?: string | null
    policyVersion: string
    confidence?: number
    now: string
  }): MemoryRecord {
    const id = randomUUID()
    const confidence = input.confidence ?? 1

    this.db
      .prepare(
        `
          INSERT INTO memories (
            id, scope_type, scope_id, kind, subject, subject_key, statement, details,
            confidence, reinforcement_count, policy_version, created_at, updated_at, last_observed_at, status, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        confidence,
        1,
        input.policyVersion,
        input.now,
        input.now,
        input.now,
        'active',
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
      confidence,
      reinforcementCount: 1,
      policyVersion: input.policyVersion,
      createdAt: input.now,
      updatedAt: input.now,
      lastObservedAt: input.now,
      status: 'active',
      deletedAt: null,
    }
  }

  reinforce(input: {
    memory: MemoryRecord
    statement: string
    details?: string | null
    policyVersion: string
    now: string
  }): MemoryRecord {
    const next = {
      ...input.memory,
      statement: input.statement,
      details: input.details ?? input.memory.details,
      confidence: input.memory.confidence + 1,
      reinforcementCount: input.memory.reinforcementCount + 1,
      policyVersion: input.policyVersion,
      updatedAt: input.now,
      lastObservedAt: input.now,
      deletedAt: null,
    }

    this.db
      .prepare(
        `
          UPDATE memories
          SET statement = ?, details = ?, confidence = ?, reinforcement_count = ?, policy_version = ?, updated_at = ?, last_observed_at = ?, deleted_at = NULL
          WHERE id = ?
        `,
      )
      .run(
        next.statement,
        next.details,
        next.confidence,
        next.reinforcementCount,
        next.policyVersion,
        next.updatedAt,
        next.lastObservedAt,
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
      .prepare(`SELECT * FROM memories WHERE ${clauses.join(' AND ')} ORDER BY confidence DESC, last_observed_at DESC, reinforcement_count DESC, subject ASC`)
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
        `SELECT * FROM memories WHERE ${clauses.join(' AND ')} ORDER BY confidence DESC, last_observed_at DESC, reinforcement_count DESC, subject ASC${limitClause}`,
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
}
