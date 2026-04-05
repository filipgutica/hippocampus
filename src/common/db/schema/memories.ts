import { sql } from 'drizzle-orm'
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectsTable } from './projects.js'
import { usersTable } from './users.js'

export const memoriesTable = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id),
    projectId: text('project_id').references(() => projectsTable.id),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    memoryType: text('memory_type').notNull(),
    subject: text('subject').notNull(),
    subjectKey: text('subject_key').notNull(),
    statement: text('statement').notNull(),
    details: text('details'),
    origin: text('origin').notNull(),
    reinforcementCount: integer('reinforcement_count').notNull(),
    policyVersion: text('policy_version').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastObservedAt: text('last_observed_at').notNull(),
    lastReinforcedAt: text('last_reinforced_at').notNull(),
    retrievalCount: integer('retrieval_count').notNull().default(0),
    lastRetrievedAt: text('last_retrieved_at'),
    strength: real('strength').notNull().default(1),
    status: text('status').notNull().default('active'),
    supersededBy: text('superseded_by'),
    deletedAt: text('deleted_at'),
  },
  table => [
    check(
      'memories_scope_project_invariant',
      sql`(
        (${table.scopeType} = 'project' AND ${table.projectId} IS NOT NULL AND ${table.scopeId} = ${table.projectId})
        OR (${table.scopeType} = 'user' AND ${table.projectId} IS NULL)
      )`,
    ),
    uniqueIndex('idx_memories_live_project_scope_memory_type_subject')
      .on(table.userId, table.projectId, table.memoryType, table.subjectKey)
      .where(sql`${table.status} in ('candidate', 'active') AND ${table.projectId} IS NOT NULL`),
    uniqueIndex('idx_memories_live_nonproject_scope_memory_type_subject')
      .on(table.userId, table.scopeType, table.scopeId, table.memoryType, table.subjectKey)
      .where(sql`${table.status} in ('candidate', 'active') AND ${table.projectId} IS NULL`),
    index('idx_memories_status_project_memory_type')
      .on(table.status, table.userId, table.projectId, table.memoryType)
      .where(sql`${table.projectId} IS NOT NULL`),
    index('idx_memories_status_nonproject_scope_memory_type')
      .on(table.status, table.userId, table.scopeType, table.scopeId, table.memoryType)
      .where(sql`${table.projectId} IS NULL`),
    index('idx_memories_superseded_by').on(table.supersededBy),
    index('idx_memories_live_last_reinforced_created')
      .on(table.status, table.lastReinforcedAt, table.createdAt)
      .where(sql`${table.status} in ('candidate', 'active')`),
  ],
)

export type MemoryRow = typeof memoriesTable.$inferSelect
export type NewMemoryRow = typeof memoriesTable.$inferInsert
