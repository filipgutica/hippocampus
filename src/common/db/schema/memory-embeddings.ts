import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { memoriesTable } from './memories.js'

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
  table => [index('idx_memory_embeddings_model_updated').on(table.modelId, table.updatedAt)],
)

export type MemoryEmbeddingRow = typeof memoryEmbeddingsTable.$inferSelect
export type NewMemoryEmbeddingRow = typeof memoryEmbeddingsTable.$inferInsert
