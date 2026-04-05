import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { createDrizzleDb } from '../common/db/drizzle.js'
import { memoryEmbeddingsTable, type MemoryEmbeddingRow } from '../common/db/schema/index.js'
import type { MemoryEmbedding } from './types/memory-embedding.js'

export class MemoryEmbeddingRepository {
  private readonly drizzleDb

  constructor(db: InstanceType<typeof Database>) {
    this.drizzleDb = createDrizzleDb(db)
  }

  getByMemoryId(memoryId: string): MemoryEmbedding | null {
    const row = this.drizzleDb
      .select({
        memoryId: memoryEmbeddingsTable.memoryId,
        modelId: memoryEmbeddingsTable.modelId,
        modelFingerprint: memoryEmbeddingsTable.modelFingerprint,
        embeddingJson: memoryEmbeddingsTable.embeddingJson,
        sourceTextHash: memoryEmbeddingsTable.sourceTextHash,
        updatedAt: memoryEmbeddingsTable.updatedAt,
      })
      .from(memoryEmbeddingsTable)
      .where(eq(memoryEmbeddingsTable.memoryId, memoryId))
      .get() as MemoryEmbeddingRow | undefined

    return row ?? null
  }

  upsert(input: {
    memoryId: string
    modelId: string
    modelFingerprint: string
    embeddingJson: string
    sourceTextHash: string
    updatedAt: string
  }): MemoryEmbedding {
    this.drizzleDb
      .insert(memoryEmbeddingsTable)
      .values({
        memoryId: input.memoryId,
        modelId: input.modelId,
        modelFingerprint: input.modelFingerprint,
        embeddingJson: input.embeddingJson,
        sourceTextHash: input.sourceTextHash,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: memoryEmbeddingsTable.memoryId,
        set: {
          modelId: input.modelId,
          modelFingerprint: input.modelFingerprint,
          embeddingJson: input.embeddingJson,
          sourceTextHash: input.sourceTextHash,
          updatedAt: input.updatedAt,
        },
      })
      .run()

    return {
      memoryId: input.memoryId,
      modelId: input.modelId,
      modelFingerprint: input.modelFingerprint,
      embeddingJson: input.embeddingJson,
      sourceTextHash: input.sourceTextHash,
      updatedAt: input.updatedAt,
    }
  }
}
