import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { createDrizzleDb, type DrizzleDb } from '../common/db/drizzle.js'
import { memoriesTable, type MemoryRow } from '../common/db/schema/index.js'
import type { ScopeRef, ScopeType } from '../common/types/scope-ref.js'
import { type ResolvedMemoryOwnership, MemoryOwnershipRepository } from './memory-ownership.repository.js'
import type { MemoryOrigin, MemoryStatus, MemoryType } from './memory.types.js'
import type { Memory } from './types/memory.js'

const getMemorySelectColumns = (alias?: string): string => {
  const prefix = alias ? `${alias}.` : ''
  return `
    ${prefix}id,
    ${prefix}scope_type AS scopeType,
    ${prefix}scope_id AS scopeId,
    ${prefix}memory_type AS memoryType,
    ${prefix}subject,
    ${prefix}subject_key AS subjectKey,
    ${prefix}statement,
    ${prefix}details,
    ${prefix}origin,
    ${prefix}reinforcement_count AS reinforcementCount,
    ${prefix}policy_version AS policyVersion,
    ${prefix}created_at AS createdAt,
    ${prefix}updated_at AS updatedAt,
    ${prefix}last_observed_at AS lastObservedAt,
    ${prefix}last_reinforced_at AS lastReinforcedAt,
    ${prefix}retrieval_count AS retrievalCount,
    ${prefix}last_retrieved_at AS lastRetrievedAt,
    ${prefix}strength,
    ${prefix}status,
    ${prefix}superseded_by AS supersededBy,
    ${prefix}deleted_at AS deletedAt
  `
}

const toMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  scope: { type: row.scopeType as ScopeRef['type'], id: row.scopeId },
  type: row.memoryType as MemoryType,
  subject: row.subject,
  subjectKey: row.subjectKey,
  statement: row.statement,
  details: row.details,
  origin: row.origin as MemoryOrigin,
  reinforcementCount: row.reinforcementCount,
  policyVersion: row.policyVersion,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastReinforcedAt: row.lastReinforcedAt || row.lastObservedAt || row.updatedAt,
  retrievalCount: row.retrievalCount,
  lastRetrievedAt: row.lastRetrievedAt,
  strength: row.strength,
  status: row.status as MemoryStatus,
  supersededBy: row.supersededBy,
  deletedAt: row.deletedAt,
})

export class MemoryRepository {
  private readonly drizzleDb: DrizzleDb
  private readonly ownershipRepository: MemoryOwnershipRepository

  constructor(input: {
    db: InstanceType<typeof Database>
    ownershipRepository: MemoryOwnershipRepository
  }) {
    this.drizzleDb = createDrizzleDb(input.db)
    this.ownershipRepository = input.ownershipRepository
  }

  private buildScopePredicate(input: {
    ownership: ResolvedMemoryOwnership
  }): SQL {
    if (input.ownership.scope.type === 'project') {
      if (!input.ownership.projectId) {
        return sql`1 = 0`
      }

      return and(
        eq(memoriesTable.userId, input.ownership.userId),
        eq(memoriesTable.projectId, input.ownership.projectId),
      ) ?? sql`1 = 0`
    }

    return and(
      eq(memoriesTable.userId, input.ownership.userId),
      eq(memoriesTable.scopeType, input.ownership.scope.type),
      eq(memoriesTable.scopeId, input.ownership.scope.id),
      isNull(memoriesTable.projectId),
    ) ?? sql`1 = 0`
  }

  findSimilar(scope: ScopeRef, type: MemoryType, subjectKey: string): Memory | null {
    const ownership = this.ownershipRepository.resolveReadScope(scope)
    const row = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(
        and(
          this.buildScopePredicate({ ownership }),
          eq(memoriesTable.memoryType, type),
          eq(memoriesTable.subjectKey, subjectKey),
          inArray(memoriesTable.status, ['candidate', 'active']),
        ),
      )
      .limit(1)
      .get()

    return row ? toMemory(row) : null
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
  }): Memory {
    const ownership = this.ownershipRepository.resolveWriteScope(input.scope, input.now)
    const id = input.id ?? randomUUID()
    const reinforcementCount = input.reinforcementCount ?? 1
    const retrievalCount = input.retrievalCount ?? 0
    const lastRetrievedAt = input.lastRetrievedAt ?? null
    const strength = input.strength ?? 1

    this.drizzleDb
      .insert(memoriesTable)
      .values({
        id,
        userId: ownership.userId,
        projectId: ownership.projectId,
        scopeType: ownership.scope.type,
        scopeId: ownership.scope.id,
        memoryType: input.type,
        subject: input.subject,
        subjectKey: input.subjectKey,
        statement: input.statement,
        details: input.details ?? null,
        origin: input.origin,
        reinforcementCount,
        policyVersion: input.policyVersion,
        createdAt: input.now,
        updatedAt: input.now,
        lastObservedAt: input.now,
        lastReinforcedAt: input.now,
        retrievalCount,
        lastRetrievedAt,
        strength,
        status: input.status,
        supersededBy: input.supersededBy ?? null,
        deletedAt: null,
      })
      .run()

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
    memory: Memory
    statement: string
    details?: string | null
    origin: MemoryOrigin
    status: MemoryStatus
    reinforcementCount: number
    policyVersion: string
    now: string
  }): Memory {
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

    this.drizzleDb
      .update(memoriesTable)
      .set({
        statement: next.statement,
        details: next.details,
        origin: next.origin,
        reinforcementCount: next.reinforcementCount,
        policyVersion: next.policyVersion,
        updatedAt: next.updatedAt,
        lastObservedAt: next.lastReinforcedAt,
        lastReinforcedAt: next.lastReinforcedAt,
        status: next.status,
        supersededBy: null,
        deletedAt: null,
      })
      .where(eq(memoriesTable.id, next.id))
      .run()

    return next
  }

  search(input: {
    scope: ScopeRef
    type?: MemoryType | null
    subject?: string | null
  }): Memory[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const filters: SQL[] = [this.buildScopePredicate({ ownership }), eq(memoriesTable.status, 'active')]

    if (input.type) {
      filters.push(eq(memoriesTable.memoryType, input.type))
    }

    if (input.subject) {
      filters.push(eq(memoriesTable.subjectKey, input.subject))
    }

    const rows = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(and(...filters))
      .all()

    return rows.map(toMemory)
  }

  listFtsCandidates(input: {
    scope: ScopeRef
    type?: MemoryType | null
    query: string
  }): Memory[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const typePredicate = input.type ? sql`AND m.memory_type = ${input.type}` : sql``

    // FTS5 is managed by handwritten migrations and is intentionally kept as
    // a raw SQL read because the virtual table is not a normal Drizzle schema table.
    const rows = this.drizzleDb.all<MemoryRow>(sql`
      SELECT ${sql.raw(getMemorySelectColumns('m'))}, bm25(memories_fts) AS rank
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ${input.query}
        AND m.status = 'active'
        AND (
          (
            ${ownership.scope.type} = 'project'
            AND ${ownership.projectId} IS NOT NULL
            AND m.user_id = ${ownership.userId}
            AND m.project_id = ${ownership.projectId}
          )
          OR (
            ${ownership.scope.type} != 'project'
            AND m.user_id = ${ownership.userId}
            AND m.scope_type = ${ownership.scope.type}
            AND m.scope_id = ${ownership.scope.id}
            AND m.project_id IS NULL
          )
        )
        ${typePredicate}
      ORDER BY rank
    `)

    return rows.map(toMemory)
  }

  countActive(input: {
    scope: ScopeRef
    type?: MemoryType | null
  }): number {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const filters: SQL[] = [this.buildScopePredicate({ ownership }), eq(memoriesTable.status, 'active')]

    if (input.type) {
      filters.push(eq(memoriesTable.memoryType, input.type))
    }

    const row = this.drizzleDb
      .select({ total: sql<number>`COUNT(*)` })
      .from(memoriesTable)
      .where(and(...filters))
      .get()

    return row?.total ?? 0
  }

  list(input: {
    scope: ScopeRef
    type?: MemoryType | null
    limit?: number | null
  }): Memory[] {
    const ownership = this.ownershipRepository.resolveReadScope(input.scope)
    const filters: SQL[] = [this.buildScopePredicate({ ownership }), eq(memoriesTable.status, 'active')]

    if (input.type) {
      filters.push(eq(memoriesTable.memoryType, input.type))
    }

    const query = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(and(...filters))

    const rows = input.limit != null ? query.limit(input.limit).all() : query.all()

    return rows.map(toMemory)
  }

  listStaleMemories(input: {
    cutoffByScope: Record<ScopeType, string>
    limit?: number | null
  }): Memory[] {
    const lastReinforcedCutoff = sql<string>`CASE ${memoriesTable.scopeType}
      WHEN 'user' THEN ${input.cutoffByScope.user}
      ELSE ${input.cutoffByScope.project}
    END`
    const lastRetrievedCutoff = sql<string>`CASE ${memoriesTable.scopeType}
      WHEN 'user' THEN ${input.cutoffByScope.user}
      ELSE ${input.cutoffByScope.project}
    END`
    const query = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(
        and(
          inArray(memoriesTable.status, ['candidate', 'active']),
          lte(memoriesTable.lastReinforcedAt, lastReinforcedCutoff),
          or(isNull(memoriesTable.lastRetrievedAt), lte(memoriesTable.lastRetrievedAt, lastRetrievedCutoff)),
        ),
      )
      .orderBy(asc(memoriesTable.lastReinforcedAt), asc(memoriesTable.createdAt))

    const rows = input.limit != null ? query.limit(input.limit).all() : query.all()

    return rows.map(toMemory)
  }

  listForMaintenance(input: {
    scope?: ScopeRef | null
    floor: number
    limit: number
  }): Memory[] {
    const filters: SQL[] = [
      eq(memoriesTable.status, 'active'),
      isNotNull(memoriesTable.lastRetrievedAt),
      gt(memoriesTable.strength, input.floor),
    ]

    if (input.scope) {
      const ownership = this.ownershipRepository.resolveReadScope(input.scope)
      filters.push(this.buildScopePredicate({ ownership }))
    }

    const rows = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(and(...filters))
      .orderBy(asc(memoriesTable.lastRetrievedAt))
      .limit(input.limit)
      .all()

    return rows.map(toMemory)
  }

  flushStrength(input: {
    id: string
    strength: number
    now: string
  }): void {
    this.drizzleDb
      .update(memoriesTable)
      .set({ strength: input.strength, updatedAt: input.now })
      .where(eq(memoriesTable.id, input.id))
      .run()
  }

  getById(id: string): Memory | null {
    const row = this.drizzleDb
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.id, id))
      .limit(1)
      .get()

    return row ? toMemory(row) : null
  }

  softDelete(input: {
    memory: Memory
    now: string
  }): Memory {
    const next: Memory = {
      ...input.memory,
      status: 'deleted',
      updatedAt: input.now,
      deletedAt: input.now,
    }

    this.drizzleDb
      .update(memoriesTable)
      .set({
        status: 'deleted',
        deletedAt: next.deletedAt,
        updatedAt: next.updatedAt,
      })
      .where(eq(memoriesTable.id, next.id))
      .run()

    return next
  }

  archiveMemoryIfLive(input: {
    id: string
    now: string
  }): Memory | null {
    const result = this.drizzleDb
      .update(memoriesTable)
      .set({ status: 'archived', updatedAt: input.now })
      .where(and(eq(memoriesTable.id, input.id), inArray(memoriesTable.status, ['candidate', 'active'])))
      .run()

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
    memory: Memory
    retrievalCount: number
    lastRetrievedAt: string | null
    strength: number
    now: string
  }): Memory {
    const next: Memory = {
      ...input.memory,
      retrievalCount: input.retrievalCount,
      lastRetrievedAt: input.lastRetrievedAt,
      strength: input.strength,
    }

    this.drizzleDb
      .update(memoriesTable)
      .set({
        retrievalCount: next.retrievalCount,
        lastRetrievedAt: next.lastRetrievedAt,
        strength: next.strength,
      })
      .where(eq(memoriesTable.id, next.id))
      .run()

    return next
  }

  suppress(input: {
    memory: Memory
    now: string
  }): Memory {
    const next: Memory = {
      ...input.memory,
      status: 'suppressed',
      updatedAt: input.now,
    }

    this.drizzleDb
      .update(memoriesTable)
      .set({ status: 'suppressed', updatedAt: next.updatedAt })
      .where(eq(memoriesTable.id, next.id))
      .run()

    return next
  }

  setSupersededBy(input: {
    memory: Memory
    supersededBy: string
    now: string
  }): Memory {
    const next: Memory = {
      ...input.memory,
      supersededBy: input.supersededBy,
      updatedAt: input.now,
    }

    this.drizzleDb
      .update(memoriesTable)
      .set({ supersededBy: next.supersededBy, updatedAt: next.updatedAt })
      .where(eq(memoriesTable.id, next.id))
      .run()

    return next
  }
}
