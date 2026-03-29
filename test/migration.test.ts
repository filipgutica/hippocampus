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
  it('adds soft-delete columns and indexes', () => {
    const dir = createTempDir()
    const db = initializeDatabase(path.join(dir, 'hippocampus.db'))

    const tableInfo = db.prepare("PRAGMA table_info('memories')").all() as Array<{ name: string }>
    const indexes = db.prepare("PRAGMA index_list('memories')").all() as Array<{ name: string }>

    expect(tableInfo.some(column => column.name === 'status')).toBe(true)
    expect(tableInfo.some(column => column.name === 'deleted_at')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_active_scope_kind_subject')).toBe(true)
    expect(indexes.some(index => index.name === 'idx_memories_status_scope_kind')).toBe(true)

    db.close()
  })
})
