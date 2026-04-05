import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const projectsTable = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    identitySource: text('identity_source').notNull(),
    identityValue: text('identity_value').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => ({
    uniqueIdentity: uniqueIndex('idx_projects_identity').on(table.identitySource, table.identityValue),
  }),
)

export const projectPathsTable = sqliteTable(
  'project_paths',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projectsTable.id),
    canonicalPath: text('canonical_path').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.projectId, table.canonicalPath] }),
    uniquePath: uniqueIndex('idx_project_paths_canonical_path').on(table.canonicalPath),
  }),
)

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
  table => ({
    scopeProjectInvariant: check(
      'memories_scope_project_invariant',
      sql`(
        (${table.scopeType} = 'project' AND ${table.projectId} IS NOT NULL AND ${table.scopeId} = ${table.projectId})
        OR (${table.scopeType} = 'user' AND ${table.projectId} IS NULL)
      )`,
    ),
    liveProjectSubject: uniqueIndex('idx_memories_live_project_scope_memory_type_subject')
      .on(table.userId, table.projectId, table.memoryType, table.subjectKey)
      .where(sql`${table.status} in ('candidate', 'active') AND ${table.projectId} IS NOT NULL`),
    liveNonProjectSubject: uniqueIndex('idx_memories_live_nonproject_scope_memory_type_subject')
      .on(table.userId, table.scopeType, table.scopeId, table.memoryType, table.subjectKey)
      .where(sql`${table.status} in ('candidate', 'active') AND ${table.projectId} IS NULL`),
    projectStatusType: index('idx_memories_status_project_memory_type')
      .on(table.status, table.userId, table.projectId, table.memoryType)
      .where(sql`${table.projectId} IS NOT NULL`),
    nonProjectStatusType: index('idx_memories_status_nonproject_scope_memory_type')
      .on(table.status, table.userId, table.scopeType, table.scopeId, table.memoryType)
      .where(sql`${table.projectId} IS NULL`),
    supersededBy: index('idx_memories_superseded_by').on(table.supersededBy),
    liveLastReinforcedCreated: index('idx_memories_live_last_reinforced_created')
      .on(table.status, table.lastReinforcedAt, table.createdAt)
      .where(sql`${table.status} in ('candidate', 'active')`),
  }),
)

export const memoryEventsTable = sqliteTable(
  'memory_events',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id').references(() => memoriesTable.id),
    eventType: text('event_type').notNull(),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    memoryType: text('memory_type').notNull(),
    subjectKey: text('subject_key').notNull(),
    observationJson: text('observation_json').notNull(),
    sourceJson: text('source_json'),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull(),
  },
  table => ({
    memoryCreatedAt: index('idx_memory_events_memory_created_at').on(table.memoryId, table.createdAt),
    scopeCreatedAt: index('idx_memory_events_scope_created_at').on(table.scopeType, table.scopeId, table.createdAt),
  }),
)

export const memoryRuntimeStateTable = sqliteTable('memory_runtime_state', {
  singleton: integer('singleton').primaryKey(),
  lastAutoArchiveSweepAt: text('last_auto_archive_sweep_at'),
})

export const memoryEmbeddingsTable = sqliteTable(
  'memory_embeddings',
  {
    memoryId: text('memory_id')
      .primaryKey()
      .references(() => memoriesTable.id),
    modelId: text('model_id').notNull(),
    embeddingJson: text('embedding_json').notNull(),
    sourceTextHash: text('source_text_hash').notNull(),
    updatedAt: text('updated_at').notNull(),
    modelFingerprint: text('model_fingerprint').notNull().default(''),
  },
  table => ({
    modelUpdated: index('idx_memory_embeddings_model_updated').on(table.modelId, table.updatedAt),
  }),
)
