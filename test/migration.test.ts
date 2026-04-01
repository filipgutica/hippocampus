import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeDatabase } from '../src/common/db/db.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-migration-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('database migrations', () => {
  it('adds lifecycle, embedding, and retrieval-strength columns and indexes', () => {
    const dir = createTempDir()
    const db = initializeDatabase(path.join(dir, 'hippocampus.db'))

    const tableInfo = db.prepare("PRAGMA table_info('memories')").all() as Array<{ name: string }>
    const indexes = db.prepare("PRAGMA index_list('memories')").all() as Array<{ name: string }>
    const embeddingTableInfo = db.prepare("PRAGMA table_info('memory_embeddings')").all() as Array<{ name: string }>
    const embeddingIndexes = db.prepare("PRAGMA index_list('memory_embeddings')").all() as Array<{ name: string }>

    expect(tableInfo.some(column => column.name === 'status')).toBe(true)
    expect(tableInfo.some(column => column.name === 'deleted_at')).toBe(true)
    expect(tableInfo.some(column => column.name === 'source_type')).toBe(true)
    expect(tableInfo.some(column => column.name === 'superseded_by')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_live_scope_kind_subject')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_status_scope_kind')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_superseded_by')).toBe(true)
    expect(tableInfo.some(column => column.name === 'confidence')).toBe(false)
    expect(tableInfo.some(column => column.name === 'last_reinforced_at')).toBe(true)
    expect(tableInfo.some(column => column.name === 'retrieval_count')).toBe(true)
    expect(tableInfo.some(column => column.name === 'last_retrieved_at')).toBe(true)
    expect(tableInfo.some(column => column.name === 'strength')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_live_last_reinforced_created')).toBe(true)
    expect(embeddingTableInfo.some(column => column.name === 'memory_id')).toBe(true)
    expect(embeddingTableInfo.some(column => column.name === 'model_id')).toBe(true)
    expect(embeddingTableInfo.some(column => column.name === 'model_fingerprint')).toBe(true)
    expect(embeddingTableInfo.some(column => column.name === 'embedding_json')).toBe(true)
    expect(embeddingTableInfo.some(column => column.name === 'source_text_hash')).toBe(true)
    expect(embeddingIndexes.some(index => index.name === 'idx_memory_embeddings_model_updated')).toBe(true)

    const inserted = db
      .prepare(
        [
          'INSERT INTO memories (',
          'id, scope_type, scope_id, kind, subject, subject_key, statement, details, source_type, reinforcement_count, policy_version, created_at, updated_at, last_observed_at, last_reinforced_at, retrieval_count, last_retrieved_at, strength, status, superseded_by, deleted_at',
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
      .run(
        'memory-1',
        'repo',
        '/tmp/example-repo',
        'preference',
        'prefer pnpm',
        'prefer pnpm',
        'Use pnpm for this repo.',
        null,
        'explicit_user_statement',
        1,
        '3',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        0,
        null,
        1,
        'active',
        null,
        null,
      )

    expect(inserted.changes).toBe(1)

    const row = db
      .prepare('SELECT last_reinforced_at, retrieval_count, last_retrieved_at, strength FROM memories WHERE id = ?')
      .get('memory-1') as {
      last_reinforced_at: string
      retrieval_count: number
      last_retrieved_at: string | null
      strength: number
    }

    expect(row.last_reinforced_at).toBe('2026-01-01T00:00:00.000Z')
    expect(row.retrieval_count).toBe(0)
    expect(row.last_retrieved_at).toBeNull()
    expect(row.strength).toBe(1)

    db.close()
  })
})
