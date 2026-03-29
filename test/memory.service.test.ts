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
  it('creates, reinforces, inspects, and deletes scoped memories', () => {
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
    const list = service.listMemories({
      scope,
      limit: 10,
    })
    const memory = service.getMemory({
      id: search.items[0]!.id,
    })
    const historyBeforeDelete = service.getMemoryHistory({
      id: memory.id,
    })
    const deleted = service.deleteMemory({
      id: memory.id,
      source: { channel: 'cli' },
    })
    const historyAfterDelete = service.getMemoryHistory({
      id: memory.id,
    })
    const searchAfterDelete = service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const listAfterDelete = service.listMemories({
      scope,
      limit: 10,
    })

    expect(first.decision).toBe('create')
    expect(second.decision).toBe('reinforce')
    expect(search.total).toBe(1)
    expect(search.items[0]?.reinforcementCount).toBe(2)
    expect(list.total).toBe(1)
    expect(memory.status).toBe('active')
    expect(historyBeforeDelete.items.map(item => item.eventType)).toEqual(['created', 'reinforced'])
    expect(deleted.memory.status).toBe('deleted')
    expect(deleted.memory.deletedAt).not.toBeNull()
    expect(deleted.event.eventType).toBe('deleted')
    expect(deleted.event.source).toEqual({ channel: 'cli' })
    expect(historyAfterDelete.items.map(item => item.eventType)).toEqual(['created', 'reinforced', 'deleted'])
    expect(searchAfterDelete.total).toBe(0)
    expect(listAfterDelete.total).toBe(0)

    db.close()
  })

  it('fails deterministically for missing or already deleted memories', () => {
    const dir = createTempDir()
    const dbFile = path.join(dir, 'hippocampus.db')
    const db = initializeDatabase(dbFile)
    const service = new MemoryService({
      memoryRepository: new MemoryRepository(db),
      memoryEventRepository: new MemoryEventRepository(db),
      policyVersion: '1',
      db,
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected create decision.')
    }

    service.deleteMemory({
      id: created.memory.id,
      source: { channel: 'cli' },
    })

    expect(() => service.getMemory({ id: 'missing-memory-id' })).toThrow('Memory not found: missing-memory-id')
    expect(() => service.deleteMemory({ id: created.memory.id, source: { channel: 'cli' } })).toThrow(
      `Memory already deleted: ${created.memory.id}`,
    )

    db.close()
  })
})
