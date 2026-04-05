import { primaryKey, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectsTable } from './projects.js'

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
  table => [
    primaryKey({ columns: [table.projectId, table.canonicalPath] }),
    uniqueIndex('idx_project_paths_canonical_path').on(table.canonicalPath),
  ],
)

export type ProjectPathRow = typeof projectPathsTable.$inferSelect
export type NewProjectPathRow = typeof projectPathsTable.$inferInsert
