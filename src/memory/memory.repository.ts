import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ScopeRef, ScopeType } from '../common/types/scope-ref.js'
import type { MemoryEntity } from './entities/memory.entity.js'
import { type ResolvedMemoryOwnership, MemoryOwnershipRepository } from './memory-ownership.repository.js'
import type { MemoryOrigin, MemoryStatus, MemoryType } from './memory.types.js'

type MemoryRow = {
  id: string
  scope_type: string
  scope_id: string
  memory_type: MemoryType
  subject: string
  subject_key: string
  statement: string
  details: string | null
  origin: MemoryOrigin
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

const toRecord = (row: MemoryRow): MemoryEntity => ({
  id: row.id,
  scope: { type: row.scope_type as ScopeRef['type'], id: row.scope_id },
  type: row.memory_type,
  subject: row.subject,
  subjectKey: row.subject_key,
  statement: row.statement,
  details: row.details,
  origin: row.origin,
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
  private readonly ownershipRepository: MemoryOwnershipRepository

  constructor(input: {
    db: InstanceType<typeof Database>
    ownershipRepository: MemoryOwnershipRepository
  }) {
    this.db = input.db
    this.ownershipRepository = input.ownershipRepository
  }

  private buildScopeClauses(input: {
    ownership: ResolvedMemoryOwnership
    scopeAlias?: string
  }): {
    clauses: string[]
    params: string[]
  } {
    const prefix = input.scopeAlias ? `${input.scopeAlias}.` : ''

    if (input.ownership.scope.type === 'repo') {
      if (!input.ownership.projectId) {
        return {
          clauses: ['1 = 0'],
          params: [],
        }
      }

      return {
        clauses: [`${prefix}user_id = ?`, `${prefix}project_id = ?`],
        params: [input.ownership.userId, input.ownership.projectId],
      }
    }

    return {
      clauses: [`${prefix}user_id = ?`, `${prefix}scope_type = ?`, `${prefix}scope_id = ?`, `${prefix}project_id IS NULL`],
      params: [input.ownership.userId, input.ownership.scope.type, input.ownership.scope.id],
    }
  }

  findSimilar(scope: ScopeRef, type: MemoryType, subjectKey: string): MemoryEntity | null {
    const ownership = this.ownershipRepository.resolveReadScope(scope)
    const scopeFilter = this.buildScopeClauses({ ownership })
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM memories
          WHERE ${scopeFilter.clauses.join(' AND ')} AND memory_type = ? AND subject_key = ? AND status IN ('candidate', 'active')
          LIMIT 1
        `,
      )
      .get(...scopeFilter.params, type, subjectKey) as MemoryRow | undefined

    return row ? toRecord(row) : null
  }

  insert(input: {
    id?: string
    scope: ScopeRef
    type: MemoryType
    subject: string
    subjectKey: string
    statement: string
    details?: string | null
    origin: MemoryOrigin
    status: MemoryStatus
    policyVersion: string
    reinforcementCount?: number
    retrievalCount?: number
    lastRetrievedAt?: string | null
    strength?: number
    supersededBy?: string | null
    now: string
  }): MemoryEntity {
    const ownership = this.ownershipRepository.resolveWriteScope(input.scope, input.now)
    const id = input.id ?? randomUUID()
    const reinforcementCount = input.reinforcementCount ?? 1
    const retrievalCount = input.retrievalCount ?? 0
    const lastRetrievedAt = input.lastRetrievedAt ?? null
    const strength = input.strength ?? 1

    this.db
      .prepare(
        `
          INSERT INTO memories (
            id, user_id, project_id, scope_type, scope_id, memory_type, subject, subject_key, statement, details,
            origin, reinforcement_count, policy_version, created_at, updated_at, last_observed_at, last_reinforced_at,
            retrieval_count, last_retrieved_at, strength, status, superseded_by, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        ownership.userId,
        ownership.projectId,
        ownership.scope.type,
        ownership.scope.id,
        input.type,
        input.subject,
        input.subjectKey,
        input.statement,
        input.details ?? null,
        input.origin,
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
      scope: ownership.scope,
      type: input.type,
      subject: input.subject,
      subjectKey: input.subjectKey,
      statement: input.statement,
      details: input.details ?? null,
      origin: input.origin,
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
    memory: MemoryEntity
    statement: string
    details?: string | null
    origin: MemoryOrigin
    status: MemoryStatus
    reinforcementCount: number
    policyVersion: string
    now: string
  }): MemoryEntity {
    const next = {
      ...input.memory,
      statement: input.statement,
      details: input.details ?? input.memory.details,
      origin: input.origin,
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
          SET statement = ?, details = ?, origin = ?, reinforcement_count = ?, policy_version = ?, updated_at = ?, last_observed_at = ?, last_reinforced_at = ?, status = ?, superseded_by = NULL, deleted_at = NULL
          WHERE id = ?
        `,
      )
      .run(
        next.statement,
        next.details,
        next.origin,
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
    type?: MemoryType | null
    subject?: string | null
  }): MemoryEntity[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const scopeFilter = this.buildScopeClauses({ ownership })
    const clauses = [...scopeFilter.clauses, "status = 'active'"]
    const params: Array<string> = [...scopeFilter.params]

    if (input.type) {
      clauses.push('memory_type = ?')
      params.push(input.type)
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

  listFtsCandidates(input: {
    scope: ScopeRef
    type?: MemoryType | null
    query: string
  }): MemoryEntity[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const scopeFilter = this.buildScopeClauses({ ownership, scopeAlias: 'm' })
    const clauses = [...scopeFilter.clauses, "m.status = 'active'"]
    const params: Array<string> = [input.query, ...scopeFilter.params]

    if (input.type) {
      clauses.push('m.memory_type = ?')
      params.push(input.type)
    }

    const rows = this.db
      .prepare(
        `
          SELECT m.*, bm25(memories_fts) AS rank
          FROM memories_fts
          JOIN memories m ON memories_fts.rowid = m.rowid
          WHERE memories_fts MATCH ?
            AND ${clauses.join(' AND ')}
          ORDER BY rank
        `,
      )
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  countActive(input: {
    scope: ScopeRef
    type?: MemoryType | null
  }): number {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const scopeFilter = this.buildScopeClauses({ ownership })
    const clauses = [...scopeFilter.clauses, "status = 'active'"]
    const params: Array<string> = [...scopeFilter.params]

    if (input.type) {
      clauses.push('memory_type = ?')
      params.push(input.type)
    }

    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM memories
          WHERE ${clauses.join(' AND ')}
        `,
      )
      .get(...params) as { total: number } | undefined

    return row?.total ?? 0
  }

  list(input: {
    scope: ScopeRef
    type?: MemoryType | null
    limit?: number | null
  }): MemoryEntity[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const scopeFilter = this.buildScopeClauses({ ownership })
    const clauses = [...scopeFilter.clauses, "status = 'active'"]
    const params: Array<string | number> = [...scopeFilter.params]

    if (input.type) {
      clauses.push('memory_type = ?')
      params.push(input.type)
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
    cutoffByScope: Record<ScopeType, string>
    limit?: number | null
  }): MemoryEntity[] {
    const params: Array<string | number> = [
      input.cutoffByScope.user,
      input.cutoffByScope.repo,
      input.cutoffByScope.org,
      input.cutoffByScope.user,
      input.cutoffByScope.repo,
      input.cutoffByScope.org,
    ]
    const limitClause = input.limit != null ? ' LIMIT ?' : ''

    if (input.limit != null) {
      params.push(input.limit)
    }

    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM memories
          WHERE status IN ('candidate', 'active')
            AND last_reinforced_at <= CASE scope_type
              WHEN 'user' THEN ?
              WHEN 'repo' THEN ?
              ELSE ?
            END
            AND (
              last_retrieved_at IS NULL
              OR last_retrieved_at <= CASE scope_type
                WHEN 'user' THEN ?
                WHEN 'repo' THEN ?
                ELSE ?
              END
            )
          ORDER BY last_reinforced_at ASC, created_at ASC
          ${limitClause}
        `,
      )
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  listForMaintenance(input: {
    scope?: ScopeRef | null
    floor: number
    limit: number
  }): MemoryEntity[] {
    const clauses = ["status = 'active'", 'last_retrieved_at IS NOT NULL', 'strength > ?']
    const params: Array<string | number> = [input.floor]

    if (input.scope) {
      const ownership = this.ownershipRepository.resolveReadScope(input.scope)
      const scopeFilter = this.buildScopeClauses({ ownership })
      clauses.push(...scopeFilter.clauses)
      params.push(...scopeFilter.params)
    }

    params.push(input.limit)

    const rows = this.db
      .prepare(
        `
          SELECT * FROM memories
          WHERE ${clauses.join(' AND ')}
          ORDER BY last_retrieved_at ASC
          LIMIT ?
        `,
      )
      .all(...params) as MemoryRow[]

    return rows.map(toRecord)
  }

  flushStrength(input: {
    id: string
    strength: number
    now: string
  }): void {
    this.db
      .prepare(
        `
          UPDATE memories
          SET strength = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(input.strength, input.now, input.id)
  }

  getById(id: string): MemoryEntity | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ? LIMIT 1').get(id) as MemoryRow | undefined

    return row ? toRecord(row) : null
  }

  softDelete(input: {
    memory: MemoryEntity
    now: string
  }): MemoryEntity {
    const next: MemoryEntity = {
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
  }): MemoryEntity | null {
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
    memory: MemoryEntity
    retrievalCount: number
    lastRetrievedAt: string | null
    strength: number
    now: string
  }): MemoryEntity {
    const next: MemoryEntity = {
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
    memory: MemoryEntity
    now: string
  }): MemoryEntity {
    const next: MemoryEntity = {
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
    memory: MemoryEntity
    supersededBy: string
    now: string
  }): MemoryEntity {
    const next: MemoryEntity = {
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
