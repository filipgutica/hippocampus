import { text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const projectsTable = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    identitySource: text('identity_source').notNull(),
    identityValue: text('identity_value').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [uniqueIndex('idx_projects_identity').on(table.identitySource, table.identityValue)],
)

export type ProjectRow = typeof projectsTable.$inferSelect
export type NewProjectRow = typeof projectsTable.$inferInsert
