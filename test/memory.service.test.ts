import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeDatabase } from '../src/common/db/db.js'
import type { ScopeRef } from '../src/common/types/scope-ref.js'
import { MemoryEventRepository } from '../src/memory/memory-event.repository.js'
import { MEMORY_POLICY_VERSION } from '../src/memory/memory.policy.js'
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
  it('classifies, promotes, contradicts, and deletes scoped memories', () => {
    const dir = createTempDir()
    const dbFile = path.join(dir, 'hippocampus.db')
    const db = initializeDatabase(dbFile)
    const memoryRepository = new MemoryRepository(db)
    const memoryEventRepository = new MemoryEventRepository(db)
    const service = new MemoryService({
      memoryRepository,
      memoryEventRepository,
      policyVersion: MEMORY_POLICY_VERSION,
      db,
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const first = service.applyObservation({
      scope,
      kind: 'preference',
      subject: ' Prefer pnpm ',
      statement: 'Use pnpm for this repo.',
      sourceType: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const second = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const third = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'explicit_user_statement',
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
    const contradicted = service.contradictMemory({
      id: memory.id,
      replacement: {
        scope,
        kind: 'preference',
        subject: 'Prefer npm',
        statement: 'Use npm for this repo.',
        sourceType: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })
    const contradictedInspect = service.getMemory({
      id: memory.id,
    })
    const replacementInspect = service.getMemory({
      id: contradicted.replacementMemory.id,
    })
    const searchAfterContradiction = service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const replacementSearch = service.searchMemories({
      scope,
      subject: 'prefer npm',
      limit: 10,
    })
    const deleted = service.deleteMemory({
      id: contradicted.replacementMemory.id,
      source: { channel: 'cli' },
    })
    const historyAfterDelete = service.getMemoryHistory({
      id: contradicted.replacementMemory.id,
    })
    const searchAfterDelete = service.searchMemories({
      scope,
      subject: 'prefer npm',
      limit: 10,
    })
    const listAfterDelete = service.listMemories({
      scope,
      limit: 10,
    })

    expect(first.decision).toBe('create')
    expect(second.decision).toBe('reinforce')
    expect(third.decision).toBe('reinforce')
    expect(search.total).toBe(1)
    expect(search.items[0]?.reinforcementCount).toBe(3)
    expect(search.items[0]?.status).toBe('active')
    expect(search.items[0]?.sourceType).toBe('explicit_user_statement')
    expect(list.total).toBe(1)
    expect(memory.status).toBe('active')
    expect(memory.supersededByMemory).toBeNull()
    expect(historyBeforeDelete.items.map(item => item.eventType)).toEqual(['created', 'reinforced', 'reinforced'])
    expect(contradicted.contradictedMemory.status).toBe('suppressed')
    expect(contradicted.contradictedMemory.supersededBy).toBe(contradicted.replacementMemory.id)
    expect(contradicted.contradictedEvent.eventType).toBe('contradicted')
    expect(contradicted.replacementMemory.status).toBe('active')
    expect(contradicted.replacementEvent.eventType).toBe('created')
    expect(contradictedInspect.supersededBy).toBe(contradicted.replacementMemory.id)
    expect(contradictedInspect.supersededByMemory?.id).toBe(contradicted.replacementMemory.id)
    expect(replacementInspect.supersededByMemory).toBeNull()
    expect(searchAfterContradiction.total).toBe(0)
    expect(replacementSearch.total).toBe(1)
    expect(deleted.memory.status).toBe('deleted')
    expect(deleted.memory.deletedAt).not.toBeNull()
    expect(deleted.event.eventType).toBe('deleted')
    expect(deleted.event.source).toEqual({ channel: 'cli' })
    expect(historyAfterDelete.items.map(item => item.eventType)).toEqual(['created', 'deleted'])
    expect(searchAfterDelete.total).toBe(0)
    expect(listAfterDelete.total).toBe(0)

    db.close()
  })

  it('fails deterministically for missing, invalid, or already superseded memories', () => {
    const dir = createTempDir()
    const dbFile = path.join(dir, 'hippocampus.db')
    const db = initializeDatabase(dbFile)
    const service = new MemoryService({
      memoryRepository: new MemoryRepository(db),
      memoryEventRepository: new MemoryEventRepository(db),
      policyVersion: MEMORY_POLICY_VERSION,
      db,
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const candidate = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer brief plans',
      statement: 'Prefer brief plans.',
      sourceType: 'observed_pattern',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected create decision.')
    }
    if (candidate.decision !== 'create' || !('memory' in candidate)) {
      throw new Error('Expected candidate create decision.')
    }

    service.deleteMemory({
      id: created.memory.id,
      source: { channel: 'cli' },
    })
    const contradicted = service.contradictMemory({
      id: candidate.memory.id,
      replacement: {
        scope,
        kind: 'preference',
        subject: 'prefer short plans',
        statement: 'Prefer short plans.',
        sourceType: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })

    let cappedMemoryId = created.memory.id
    for (let index = 0; index < 10; index += 1) {
      const result = service.applyObservation({
        scope,
        kind: 'workflow',
        subject: 'run tests before commit',
        statement: 'Run tests before commit.',
        sourceType: 'explicit_user_statement',
        source: { channel: 'cli' },
      })

      if ('memory' in result) {
        cappedMemoryId = result.memory.id
      }
    }

    const capped = service.getMemory({ id: cappedMemoryId })

    expect(() => service.getMemory({ id: 'missing-memory-id' })).toThrow('Memory not found: missing-memory-id')
    expect(() => service.deleteMemory({ id: created.memory.id, source: { channel: 'cli' } })).toThrow(
      `Memory already deleted: ${created.memory.id}`,
    )
    expect(() =>
      service.contradictMemory({
        id: contradicted.contradictedMemory.id,
        replacement: {
          scope,
          kind: 'preference',
          subject: 'prefer direct answers',
          statement: 'Prefer direct answers.',
          sourceType: 'explicit_user_statement',
          details: null,
        },
        source: { channel: 'cli' },
      }),
    ).toThrow(`Memory already superseded: ${contradicted.contradictedMemory.id}`)
    expect(capped.status).toBe('active')
    expect(capped.reinforcementCount).toBe(5)
    expect(capped.confidence).toBe(5)

    db.close()
  })
})
