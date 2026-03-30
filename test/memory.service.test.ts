import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeDatabase } from '../src/common/db/db.js'
import type { ScopeRef } from '../src/common/types/scope-ref.js'
import { MemoryEventRepository } from '../src/memory/memory-event.repository.js'
import { MEMORY_POLICY_VERSION } from '../src/memory/memory.policy.js'
import { MemoryRepository } from '../src/memory/memory.repository.js'
import { MemoryRuntimeStateRepository } from '../src/memory/memory-runtime-state.repository.js'
import { MemoryService } from '../src/memory/memory.service.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-memory-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.useRealTimers()

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const createService = () => {
  const dir = createTempDir()
  const dbFile = path.join(dir, 'hippocampus.db')
  const db = initializeDatabase(dbFile)
  const memoryRuntimeStateRepository = new MemoryRuntimeStateRepository(db)

  return {
    db,
    memoryRuntimeStateRepository,
    service: new MemoryService({
      memoryRepository: new MemoryRepository(db),
      memoryEventRepository: new MemoryEventRepository(db),
      memoryRuntimeStateRepository,
      policyVersion: MEMORY_POLICY_VERSION,
      db,
    }),
  }
}

describe('MemoryService', () => {
  it('classifies, promotes, contradicts, and deletes scoped memories', () => {
    const { db, service } = createService()
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
    const { db, service } = createService()
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

  it('archives stale active and candidate memories without changing evidence and supports dry runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const active = service.applyObservation({
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
      subject: 'prefer short plans',
      statement: 'Prefer short plans.',
      sourceType: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const superseded = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const deleted = service.applyObservation({
      scope,
      kind: 'tooling',
      subject: 'prefer eslint',
      statement: 'Use eslint for linting.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (active.decision !== 'create' || !('memory' in active)) {
      throw new Error('Expected active memory creation.')
    }
    if (candidate.decision !== 'create' || !('memory' in candidate)) {
      throw new Error('Expected candidate memory creation.')
    }
    if (superseded.decision !== 'create' || !('memory' in superseded)) {
      throw new Error('Expected superseded memory creation.')
    }
    if (deleted.decision !== 'create' || !('memory' in deleted)) {
      throw new Error('Expected deleted memory creation.')
    }

    const contradicted = service.contradictMemory({
      id: superseded.memory.id,
      replacement: {
        scope,
        kind: superseded.memory.kind,
        subject: 'prefer npm',
        statement: 'Use npm for this repo.',
        sourceType: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })
    service.deleteMemory({
      id: deleted.memory.id,
      source: { channel: 'cli' },
    })

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

    const dryRun = service.archiveStaleMemories({
      dryRun: true,
      source: { channel: 'cli' },
    })

    expect(dryRun.total).toBe(3)
    expect(dryRun.items.map(item => item.id).sort()).toEqual([
      active.memory.id,
      contradicted.replacementMemory.id,
      candidate.memory.id,
    ].sort())

    const archived = service.archiveStaleMemories({
      source: { channel: 'cli' },
    })
    const activeInspect = service.getMemory({ id: active.memory.id })
    const candidateInspect = service.getMemory({ id: candidate.memory.id })
    const supersededInspect = service.getMemory({ id: superseded.memory.id })
    const deletedInspect = service.getMemory({ id: deleted.memory.id })
    const activeHistory = service.getMemoryHistory({ id: active.memory.id })
    const activeSearch = service.searchMemories({
      scope,
      subject: 'run tests before commit',
      limit: 10,
    })
    const candidateSearch = service.searchMemories({
      scope,
      subject: 'prefer short plans',
      limit: 10,
    })
    const list = service.listMemories({
      scope,
      limit: 10,
    })

    expect(archived.total).toBe(3)
    expect(archived.items.map(item => item.id).sort()).toEqual([
      active.memory.id,
      candidate.memory.id,
      contradicted.replacementMemory.id,
    ].sort())
    expect(activeInspect.status).toBe('archived')
    expect(candidateInspect.status).toBe('archived')
    expect(activeInspect.confidence).toBe(active.memory.confidence)
    expect(activeInspect.reinforcementCount).toBe(active.memory.reinforcementCount)
    expect(candidateInspect.confidence).toBe(candidate.memory.confidence)
    expect(candidateInspect.reinforcementCount).toBe(candidate.memory.reinforcementCount)
    expect(supersededInspect.status).toBe('suppressed')
    expect(deletedInspect.status).toBe('deleted')
    expect(activeHistory.items.map(item => item.eventType)).toEqual(['created', 'archived'])
    expect(activeHistory.items[1]?.source).toEqual({ channel: 'cli' })
    expect(activeSearch.total).toBe(0)
    expect(candidateSearch.total).toBe(0)
    expect(list.items.every(item => item.status === 'active')).toBe(true)

    db.close()
  })

  it('archives automatically on eligible reads, does not resurrect archived memories, and allows contradiction', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

    const firstSearch = service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const archivedHistory = service.getMemoryHistory({ id: created.memory.id })

    expect(firstSearch.total).toBe(0)
    expect(service.getMemory({ id: created.memory.id }).status).toBe('archived')
    expect(archivedHistory.items.map(item => item.eventType)).toEqual(['created', 'archived'])
    expect(archivedHistory.items[1]?.source).toBeNull()

    service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    expect(service.getMemoryHistory({ id: created.memory.id }).items.map(item => item.eventType)).toEqual([
      'created',
      'archived',
    ])

    const recreated = service.applyObservation({
      scope,
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (recreated.decision !== 'create' || !('memory' in recreated)) {
      throw new Error('Expected archived memory to stay non-live for matching.')
    }

    const contradicted = service.contradictMemory({
      id: created.memory.id,
      replacement: {
        scope,
        kind: 'preference',
        subject: 'prefer npm',
        statement: 'Use npm for this repo.',
        sourceType: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })

    expect(recreated.memory.id).not.toBe(created.memory.id)
    expect(service.searchMemories({ scope, subject: 'prefer pnpm', limit: 10 }).items[0]?.id).toBe(recreated.memory.id)
    expect(contradicted.contradictedMemory.status).toBe('suppressed')
    expect(contradicted.replacementMemory.status).toBe('active')

    db.close()
  })

  it('does not auto-archive on get/history/delete and honors the automatic sweep cooldown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const readOnlyCreated = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'read docs before coding',
      statement: 'Read docs before coding.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const deletedCreated = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'run tests before merge',
      statement: 'Run tests before merge.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (readOnlyCreated.decision !== 'create' || !('memory' in readOnlyCreated)) {
      throw new Error('Expected read-only memory creation.')
    }
    if (deletedCreated.decision !== 'create' || !('memory' in deletedCreated)) {
      throw new Error('Expected delete-path memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

    expect(service.getMemory({ id: readOnlyCreated.memory.id }).status).toBe('active')
    expect(service.getMemoryHistory({ id: readOnlyCreated.memory.id }).items.map(item => item.eventType)).toEqual([
      'created',
    ])

    const deleted = service.deleteMemory({
      id: deletedCreated.memory.id,
      source: { channel: 'cli' },
    })
    expect(deleted.memory.status).toBe('deleted')
    expect(service.getMemoryHistory({ id: deletedCreated.memory.id }).items.map(item => item.eventType)).toEqual([
      'created',
      'deleted',
    ])

    const archivedBySearch = service.searchMemories({
      scope,
      subject: 'read docs before coding',
      limit: 10,
    })
    expect(archivedBySearch.total).toBe(0)
    expect(service.getMemory({ id: readOnlyCreated.memory.id }).status).toBe('archived')

    const cooldownCreated = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'keep commits focused',
      statement: 'Keep commits focused.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (cooldownCreated.decision !== 'create' || !('memory' in cooldownCreated)) {
      throw new Error('Expected cooldown memory creation.')
    }

    db.prepare('UPDATE memories SET last_observed_at = ?, updated_at = ? WHERE id = ?').run(
      '2025-12-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      cooldownCreated.memory.id,
    )

    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'))

    const duringCooldown = service.searchMemories({
      scope,
      subject: 'keep commits focused',
      limit: 10,
    })
    expect(duringCooldown.total).toBe(1)
    expect(duringCooldown.items[0]?.id).toBe(cooldownCreated.memory.id)
    expect(service.getMemory({ id: cooldownCreated.memory.id }).status).toBe('active')

    memoryRuntimeStateRepository.setLastAutoArchiveSweepAt('2026-04-04T00:00:00.000Z')

    const afterCooldown = service.searchMemories({
      scope,
      subject: 'keep commits focused',
      limit: 10,
    })
    expect(afterCooldown.total).toBe(0)
    expect(service.getMemory({ id: cooldownCreated.memory.id }).status).toBe('archived')

    db.close()
  })

  it('does not auto-archive stale memories for invalid eligible requests', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      kind: 'workflow',
      subject: 'write tests first',
      statement: 'Write tests first.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))
    const initialSweepAt = memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()

    expect(() =>
      service.searchMemories({
        scope,
        subject: 'write tests first',
        limit: 0,
      }),
    ).toThrow('Limit must be a positive integer.')
    expect(service.getMemory({ id: created.memory.id }).status).toBe('active')
    expect(service.getMemoryHistory({ id: created.memory.id }).items.map(item => item.eventType)).toEqual(['created'])
    expect(memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()).toBe(initialSweepAt)

    db.close()
  })

  it('continues automatic archival across batches without waiting for the cooldown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    for (let index = 0; index < 51; index += 1) {
      service.applyObservation({
        scope,
        kind: 'workflow',
        subject: `stale memory ${index}`,
        statement: `Stale memory ${index}.`,
        sourceType: 'explicit_user_statement',
        source: { channel: 'cli' },
      })
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))
    const initialSweepAt = memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()

    const firstList = service.listMemories({
      scope,
      limit: 100,
    })

    expect(firstList.total).toBe(1)
    expect(memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()).toBe(initialSweepAt)

    const secondList = service.listMemories({
      scope,
      limit: 100,
    })

    expect(secondList.total).toBe(0)
    expect(memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()).toBe('2026-04-05T00:00:00.000Z')

    db.close()
  })

  it('canonicalizes existing repo scope paths by realpath and preserves missing repo scope ids', () => {
    const { db, service } = createService()
    const dir = createTempDir()
    const repoRoot = path.join(dir, 'repo')
    const repoSymlink = path.join(dir, 'repo-link')
    const missingRepoScopeId = path.join(dir, 'missing-repo')

    fs.mkdirSync(repoRoot)
    fs.symlinkSync(repoRoot, repoSymlink)

    const created = service.applyObservation({
      scope: { type: 'repo', id: `${repoSymlink}${path.sep}` },
      kind: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const realpathSearch = service.searchMemories({
      scope: { type: 'repo', id: repoRoot },
      subject: 'prefer pnpm',
      limit: 10,
    })
    const trailingSlashSearch = service.searchMemories({
      scope: { type: 'repo', id: `${repoRoot}${path.sep}` },
      subject: 'prefer pnpm',
      limit: 10,
    })
    const missingCreated = service.applyObservation({
      scope: { type: 'repo', id: missingRepoScopeId },
      kind: 'workflow',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      sourceType: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const missingSearch = service.searchMemories({
      scope: { type: 'repo', id: missingRepoScopeId },
      subject: 'run tests before commit',
      limit: 10,
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected create decision for canonicalized repo path.')
    }
    if (missingCreated.decision !== 'create' || !('memory' in missingCreated)) {
      throw new Error('Expected create decision for missing repo scope id.')
    }

    expect(created.memory.scope.id).toBe(fs.realpathSync(repoRoot))
    expect(realpathSearch.total).toBe(1)
    expect(trailingSlashSearch.total).toBe(1)
    expect(missingCreated.memory.scope.id).toBe(missingRepoScopeId)
    expect(missingSearch.total).toBe(1)

    db.close()
  })
})
