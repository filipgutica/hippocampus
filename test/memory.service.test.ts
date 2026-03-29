import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeDatabase } from '../src/common/db/db.js'
import type { ScopeRef } from '../src/common/types/scope-ref.js'
import { MemoryEventRepository } from '../src/memory/memory-event.repository.js'
import { MemoryRepository } from '../src/memory/memory.repository.js'
import { MemoryService } from '../src/memory/memory.service.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-memory-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('MemoryService', () => {
  it('creates and reinforces scoped memories', () => {
    const dir = createTempDir()
    const dbFile = path.join(dir, 'hippocampus.db')
    const db = initializeDatabase(dbFile)
    const memoryRepository = new MemoryRepository(db)
    const memoryEventRepository = new MemoryEventRepository(db)
    const service = new MemoryService({
      memoryRepository,
      memoryEventRepository,
      policyVersion: '1',
      db,
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const first = service.applyObservation({
      scope,
      kind: 'preference',
      subject: ' Prefer pnpm ',
      statement: 'Use pnpm for this repo.',
      source: { channel: 'cli' },
    })
    const second = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      source: { channel: 'cli' },
    })
    const search = service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })

    expect(first.decision).toBe('create')
    expect(second.decision).toBe('reinforce')
    expect(search.total).toBe(1)
    expect(search.items[0]?.reinforcementCount).toBe(2)

    db.close()
  })
})
