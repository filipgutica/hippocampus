import { text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type UserRow = typeof usersTable.$inferSelect
export type NewUserRow = typeof usersTable.$inferInsert
