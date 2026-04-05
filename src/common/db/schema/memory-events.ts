import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { memoriesTable } from './memories.js'

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
  table => [
    index('idx_memory_events_memory_created_at').on(table.memoryId, table.createdAt),
    index('idx_memory_events_scope_created_at').on(table.scopeType, table.scopeId, table.createdAt),
  ],
)

export type MemoryEventRow = typeof memoryEventsTable.$inferSelect
export type NewMemoryEventRow = typeof memoryEventsTable.$inferInsert
