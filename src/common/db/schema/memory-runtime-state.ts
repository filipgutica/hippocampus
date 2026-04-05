import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const memoryRuntimeStateTable = sqliteTable('memory_runtime_state', {
  singleton: integer('singleton').primaryKey(),
  lastAutoArchiveSweepAt: text('last_auto_archive_sweep_at'),
})

export type MemoryRuntimeStateRow = typeof memoryRuntimeStateTable.$inferSelect
export type NewMemoryRuntimeStateRow = typeof memoryRuntimeStateTable.$inferInsert
