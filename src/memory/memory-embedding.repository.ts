import type Database from 'better-sqlite3'

export type MemoryEmbeddingRecord = {
  memoryId: string
  modelId: string
  modelFingerprint: string
  embeddingJson: string
  sourceTextHash: string
  updatedAt: string
}

type MemoryEmbeddingRow = {
  memory_id: string
  model_id: string
  model_fingerprint: string
  embedding_json: string
  source_text_hash: string
  updated_at: string
}

const toRecord = (row: MemoryEmbeddingRow): MemoryEmbeddingRecord => ({
  memoryId: row.memory_id,
  modelId: row.model_id,
  modelFingerprint: row.model_fingerprint,
  embeddingJson: row.embedding_json,
  sourceTextHash: row.source_text_hash,
  updatedAt: row.updated_at,
})

export class MemoryEmbeddingRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  getByMemoryId(memoryId: string): MemoryEmbeddingRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT memory_id, model_id, model_fingerprint, embedding_json, source_text_hash, updated_at
          FROM memory_embeddings
          WHERE memory_id = ?
          LIMIT 1
        `,
      )
      .get(memoryId) as MemoryEmbeddingRow | undefined

    return row ? toRecord(row) : null
  }

  upsert(input: {
    memoryId: string
    modelId: string
    modelFingerprint: string
    embeddingJson: string
    sourceTextHash: string
    updatedAt: string
  }): MemoryEmbeddingRecord {
    this.db
      .prepare(
        `
          INSERT INTO memory_embeddings (memory_id, model_id, model_fingerprint, embedding_json, source_text_hash, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(memory_id) DO UPDATE SET
            model_id = excluded.model_id,
            model_fingerprint = excluded.model_fingerprint,
            embedding_json = excluded.embedding_json,
            source_text_hash = excluded.source_text_hash,
            updated_at = excluded.updated_at
        `,
      )
      .run(input.memoryId, input.modelId, input.modelFingerprint, input.embeddingJson, input.sourceTextHash, input.updatedAt)

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
