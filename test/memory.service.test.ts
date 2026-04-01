import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/common/errors.js'
import { initializeDatabase } from '../src/common/db/db.js'
import type { ScopeRef } from '../src/common/types/scope-ref.js'
import { MemoryEmbeddingRepository } from '../src/memory/memory-embedding.repository.js'
import { MemoryEventRepository } from '../src/memory/memory-event.repository.js'
import type { EmbeddingProvider } from '../src/memory/local-embedding-provider.js'
import { MEMORY_POLICY_VERSION } from '../src/memory/memory.policy.js'
import { MemoryRepository } from '../src/memory/memory.repository.js'
import { MemoryRuntimeStateRepository } from '../src/memory/memory-runtime-state.repository.js'
import { MemoryService } from '../src/memory/memory.service.js'
import { getSemanticSourceText, getSourceTextHash } from '../src/memory/semantic-search.js'

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

const createService = (options?: {
  embeddingProvider?: EmbeddingProvider
}) => {
  const dir = createTempDir()
  const dbFile = path.join(dir, 'hippocampus.db')
  const db = initializeDatabase(dbFile)
  const memoryRuntimeStateRepository = new MemoryRuntimeStateRepository(db)
  const embeddingProvider =
    options?.embeddingProvider ??
    {
      getModelId: () => 'Xenova/bge-small-en-v1.5',
      getCacheDir: () => path.join(dir, 'cache', 'transformers'),
      getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
      getModelFingerprint: async () => 'default-fingerprint',
      embed: async (input: string) => {
        const lower = input.toLowerCase()

        if (lower.includes('package manager')) {
          return [0.7, 0.7, 0]
        }

        if (lower.includes('prefer pnpm')) {
          return [1, 0, 0]
        }

        if (lower.includes('prefer npm')) {
          return [0, 1, 0]
        }

        if (lower.includes('tests') || lower.includes('commit')) {
          return [0, 1, 0]
        }

        if (lower.includes('docs')) {
          return [0, 0.9, 0.1]
        }

        return [0, 0, 1]
      },
    }

  return {
    db,
    memoryRuntimeStateRepository,
    embeddingProvider,
    service: new MemoryService({
      embeddingProvider,
      memoryEmbeddingRepository: new MemoryEmbeddingRepository(db),
      memoryRepository: new MemoryRepository(db),
      memoryEventRepository: new MemoryEventRepository(db),
      memoryRuntimeStateRepository,
      policyVersion: MEMORY_POLICY_VERSION,
      db,
    }),
  }
}

const getStoredMemoryState = (
  db: ReturnType<typeof initializeDatabase>,
  id: string,
): {
  last_reinforced_at: string
  retrieval_count: number
  last_retrieved_at: string | null
  strength: number
  status: string
  updated_at: string
} =>
  db
    .prepare(
      'SELECT last_reinforced_at, retrieval_count, last_retrieved_at, strength, status, updated_at FROM memories WHERE id = ?',
    )
    .get(id) as {
    last_reinforced_at: string
    retrieval_count: number
    last_retrieved_at: string | null
    strength: number
    status: string
    updated_at: string
  }

describe('MemoryService', () => {
  it('classifies, promotes, contradicts, and deletes scoped memories', async () => {
    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const first = service.applyObservation({
      scope,
      type: 'preference',
      subject: ' Prefer pnpm ',
      statement: 'Use pnpm for this repo.',
      origin: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const second = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const third = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const search = await service.searchMemories({
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
        type: 'preference',
        subject: 'Prefer npm',
        statement: 'Use npm for this repo.',
        origin: 'explicit_user_statement',
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
    const searchAfterContradiction = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const replacementSearch = await service.searchMemories({
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
    const searchAfterDelete = await service.searchMemories({
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
    expect(search.items[0]?.origin).toBe('explicit_user_statement')
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

  it('fails deterministically for missing, invalid, or already superseded memories', async () => {
    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const candidate = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer brief plans',
      statement: 'Prefer brief plans.',
      origin: 'observed_pattern',
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
        type: 'preference',
        subject: 'prefer short plans',
        statement: 'Prefer short plans.',
        origin: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })

    let cappedMemoryId = created.memory.id
    for (let index = 0; index < 10; index += 1) {
      const result = service.applyObservation({
        scope,
        type: 'procedural',
        subject: 'run tests before commit',
        statement: 'Run tests before commit.',
        origin: 'explicit_user_statement',
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
          type: 'preference',
          subject: 'prefer direct answers',
          statement: 'Prefer direct answers.',
          origin: 'explicit_user_statement',
          details: null,
        },
        source: { channel: 'cli' },
      }),
    ).toThrow(`Memory already superseded: ${contradicted.contradictedMemory.id}`)
    expect(capped.status).toBe('active')
    expect(capped.reinforcementCount).toBe(5)

    db.close()
  })

  it('updates lastReinforcedAt on writes and retrieval state only on memory-search', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    const initialState = getStoredMemoryState(db, created.memory.id)
    expect(initialState.last_reinforced_at).toBe('2026-01-01T00:00:00.000Z')
    expect(initialState.retrieval_count).toBe(0)
    expect(initialState.last_retrieved_at).toBeNull()
    expect(initialState.strength).toBe(1)

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'))
    const search = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      matchMode: 'exact',
      limit: 10,
    })
    const searchedState = getStoredMemoryState(db, created.memory.id)

    expect(search.items[0]?.retrievalCount).toBe(1)
    expect(search.items[0]?.lastRetrievedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(searchedState.last_reinforced_at).toBe('2026-01-01T00:00:00.000Z')
    expect(searchedState.retrieval_count).toBe(1)
    expect(searchedState.last_retrieved_at).toBe('2026-01-02T00:00:00.000Z')

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'))
    service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm and keep the lockfile committed.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    const reinforced = service.getMemory({ id: created.memory.id })
    expect(reinforced.lastReinforcedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(reinforced.retrievalCount).toBe(1)
    expect(reinforced.lastRetrievedAt).toBe('2026-01-02T00:00:00.000Z')

    db.close()
  })

  it('keeps memory-list, memory-get, and history reads retrieval-neutral', async () => {
    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    service.listMemories({ scope, limit: 10 })
    service.getMemory({ id: created.memory.id })
    service.getMemoryHistory({ id: created.memory.id })

    const state = getStoredMemoryState(db, created.memory.id)
    expect(state.retrieval_count).toBe(0)
    expect(state.last_retrieved_at).toBeNull()
    expect(state.strength).toBe(1)

    db.close()
  })

  it('increments retrieval state only for returned top-N memories and boosts at threshold boundaries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const first = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const second = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer npm',
      statement: 'Use npm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (first.decision !== 'create' || !('memory' in first) || second.decision !== 'create' || !('memory' in second)) {
      throw new Error('Expected memory creation.')
    }

    for (let index = 0; index < 3; index += 1) {
      await service.searchMemories({
        scope,
        subject: 'prefer pnpm',
        matchMode: 'exact',
        limit: 1,
      })
    }

    const boosted = getStoredMemoryState(db, first.memory.id)
    const untouched = getStoredMemoryState(db, second.memory.id)

    expect(boosted.retrieval_count).toBe(3)
    expect(boosted.last_retrieved_at).toBe('2026-01-01T00:00:00.000Z')
    expect(boosted.strength).toBeCloseTo(1.1, 5)
    expect(untouched.retrieval_count).toBe(0)
    expect(untouched.last_retrieved_at).toBeNull()
    expect(untouched.strength).toBe(1)

    db.close()
  })

  it('uses lastRetrievedAt for lazy decay and retrieval strength as a semantic tie-break', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => 'semantic-fingerprint',
        embed: async input => {
          const lower = input.toLowerCase()
          if (lower.includes('package manager')) {
            return [1, 0, 0]
          }

          if (lower.includes('pnpm') || lower.includes('npm')) {
            return [1, 0, 0]
          }

          return [0, 1, 0]
        },
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const pnpm = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const npm = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer npm',
      statement: 'Use npm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (pnpm.decision !== 'create' || !('memory' in pnpm) || npm.decision !== 'create' || !('memory' in npm)) {
      throw new Error('Expected memory creation.')
    }

    for (let index = 0; index < 3; index += 1) {
      await service.searchMemories({
        scope,
        subject: 'prefer pnpm',
        matchMode: 'exact',
        limit: 1,
      })
    }

    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'))
    const hybrid = await service.searchMemories({
      scope,
      subject: 'package manager',
      limit: 10,
    })

    const boosted = getStoredMemoryState(db, pnpm.memory.id)
    expect(hybrid.items.map(item => item.subject)).toEqual(['prefer pnpm', 'prefer npm'])
    expect(boosted.retrieval_count).toBe(4)
    expect(boosted.strength).toBeCloseTo(1.045, 3)

    db.close()
  })

  it('uses hybrid search by default, keeps exact explicit, and refreshes cached embeddings when memory text changes', async () => {
    const { db, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => 'semantic-fingerprint',
        embed: async (input: string) => {
          const lower = input.toLowerCase()

          if (lower.includes('pnpm') || lower.includes('package manager')) {
            return [1, 0, 0]
          }

          if (lower.includes('npm')) {
            return [0.8, 0.2, 0]
          }

          return [0, 1, 0]
        },
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer npm',
      statement: 'Use npm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    const hybrid = await service.searchMemories({
      scope,
      subject: 'preferred package manager',
      limit: 10,
    })
    const exact = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      matchMode: 'exact',
      limit: 10,
    })

    const beforeRefresh = db
      .prepare('SELECT source_text_hash FROM memory_embeddings WHERE memory_id = ?')
      .get(hybrid.items[0]!.id) as { source_text_hash: string }

    service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm and keep the lockfile committed.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    await service.searchMemories({
      scope,
      subject: 'preferred package manager',
      limit: 10,
    })

    const afterRefresh = db
      .prepare('SELECT source_text_hash FROM memory_embeddings WHERE memory_id = ?')
      .get(hybrid.items[0]!.id) as { source_text_hash: string }

    expect(hybrid.items.map(item => item.subject)).toEqual(['prefer pnpm', 'prefer npm'])
    expect(hybrid.requestedMatchMode).toBe('hybrid')
    expect(hybrid.effectiveMatchMode).toBe('hybrid')
    expect(exact.items.map(item => item.subject)).toEqual(['prefer pnpm'])
    expect(exact.requestedMatchMode).toBe('exact')
    expect(exact.effectiveMatchMode).toBe('exact')
    expect(beforeRefresh.source_text_hash).not.toBe(afterRefresh.source_text_hash)

    db.close()
  })

  it('falls back to exact search when hybrid retrieval is unavailable', async () => {
    const { db, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => 'missing-fingerprint',
        embed: async () => {
          throw new AppError('SEMANTIC_MODEL_NOT_AVAILABLE', 'Download it from https://huggingface.co/Xenova/bge-small-en-v1.5.')
        },
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    const hybrid = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const explicitHybrid = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      matchMode: 'hybrid',
      limit: 10,
    })
    const exact = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      matchMode: 'exact',
      limit: 10,
    })

    expect(hybrid.items.map(item => item.subject)).toEqual(['prefer pnpm'])
    expect(hybrid.effectiveMatchMode).toBe('exact')
    expect(hybrid.fallbackReason).toContain('Semantic retrieval unavailable')
    expect(explicitHybrid.effectiveMatchMode).toBe('exact')
    expect(explicitHybrid.fallbackReason).toContain('Download it from https://huggingface.co/Xenova/bge-small-en-v1.5.')
    expect(exact.effectiveMatchMode).toBe('exact')
    expect(exact.fallbackReason).toBeUndefined()

    db.close()
  })

  it('throws when semantic cache data is corrupted instead of silently degrading', async () => {
    const { db, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => 'semantic-fingerprint',
        embed: async () => [1, 0, 0],
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    const memory = created.memory
    const sourceText = getSemanticSourceText(memory)
    const sourceTextHash = getSourceTextHash(sourceText)

    db.prepare(
      [
        'INSERT INTO memory_embeddings (memory_id, model_id, model_fingerprint, embedding_json, source_text_hash, updated_at)',
        'VALUES (?, ?, ?, ?, ?, ?)',
      ].join(' '),
    ).run(
      memory.id,
      'Xenova/bge-small-en-v1.5',
      'semantic-fingerprint',
      'not-json',
      sourceTextHash,
      new Date().toISOString(),
    )

    await expect(
      service.searchMemories({
        scope,
        subject: 'preferred package manager',
        limit: 10,
      }),
    ).rejects.toThrow()

    db.close()
  })

  it('does not auto-archive stale memories when search is invalid before hybrid retrieval starts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => 'missing-fingerprint',
        embed: async () => {
          throw new Error('Download it from https://huggingface.co/Xenova/bge-small-en-v1.5.')
        },
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))
    const initialSweepAt = memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()

    await expect(
      service.searchMemories({
        scope,
        subject: '',
        limit: 10,
      }),
    ).rejects.toThrow('subject must not be empty for memory-search.')

    expect(service.getMemory({ id: created.memory.id }).status).toBe('active')
    expect(service.getMemoryHistory({ id: created.memory.id }).items.map(item => item.eventType)).toEqual(['created'])
    expect(memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()).toBe(initialSweepAt)

    db.close()
  })

  it('refreshes cached embeddings when only the model fingerprint changes', async () => {
    let currentFingerprint = 'fingerprint-a'
    let currentEmbedding = [1, 0, 0]

    const { db, service } = createService({
      embeddingProvider: {
        getModelId: () => 'Xenova/bge-small-en-v1.5',
        getCacheDir: () => '/tmp/fake-cache',
        getModelSource: () => 'https://huggingface.co/Xenova/bge-small-en-v1.5',
        getModelFingerprint: async () => currentFingerprint,
        embed: async input => (input.toLowerCase().includes('package manager') ? [1, 0, 0] : currentEmbedding),
      },
    })
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    await service.searchMemories({
      scope,
      subject: 'package manager',
      limit: 10,
    })

    const before = db
      .prepare('SELECT model_fingerprint, embedding_json FROM memory_embeddings WHERE memory_id = ?')
      .get(created.memory.id) as { model_fingerprint: string; embedding_json: string }

    currentFingerprint = 'fingerprint-b'
    currentEmbedding = [0.5, 0.5, 0]

    await service.searchMemories({
      scope,
      subject: 'package manager',
      limit: 10,
    })

    const after = db
      .prepare('SELECT model_fingerprint, embedding_json FROM memory_embeddings WHERE memory_id = ?')
      .get(created.memory.id) as { model_fingerprint: string; embedding_json: string }

    expect(before.model_fingerprint).toBe('fingerprint-a')
    expect(after.model_fingerprint).toBe('fingerprint-b')
    expect(before.embedding_json).not.toBe(after.embedding_json)

    db.close()
  })

  it('archives stale active and candidate memories without changing evidence and supports dry runs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const active = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const candidate = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer short plans',
      statement: 'Prefer short plans.',
      origin: 'observed_pattern',
      source: { channel: 'cli' },
    })
    const superseded = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const deleted = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'prefer eslint',
      statement: 'Use eslint for linting.',
      origin: 'explicit_user_statement',
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
        type: 'semantic',
        subject: 'prefer npm',
        statement: 'Use npm for this repo.',
        origin: 'explicit_user_statement',
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
    expect(contradicted.replacementMemory.type).toBe('semantic')
    expect(contradicted.contradictedMemory.type).toBe('preference')
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
    const activeSearch = await service.searchMemories({
      scope,
      subject: 'run tests before commit',
      limit: 10,
    })
    const candidateSearch = await service.searchMemories({
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
    expect(activeInspect.reinforcementCount).toBe(active.memory.reinforcementCount)
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

  it('archives automatically on eligible reads, does not resurrect archived memories, and allows contradiction', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

    const firstSearch = await service.searchMemories({
      scope,
      subject: 'prefer pnpm',
      limit: 10,
    })
    const archivedHistory = service.getMemoryHistory({ id: created.memory.id })

    expect(firstSearch.total).toBe(0)
    expect(service.getMemory({ id: created.memory.id }).status).toBe('archived')
    expect(archivedHistory.items.map(item => item.eventType)).toEqual(['created', 'archived'])
    expect(archivedHistory.items[1]?.source).toBeNull()

    await service.searchMemories({
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
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (recreated.decision !== 'create' || !('memory' in recreated)) {
      throw new Error('Expected archived memory to stay non-live for matching.')
    }

    const contradicted = service.contradictMemory({
      id: created.memory.id,
      replacement: {
        scope,
        type: 'preference',
        subject: 'prefer npm',
        statement: 'Use npm for this repo.',
        origin: 'explicit_user_statement',
        details: null,
      },
      source: { channel: 'cli' },
    })

    expect(recreated.memory.id).not.toBe(created.memory.id)
    expect((await service.searchMemories({ scope, subject: 'prefer pnpm', limit: 10 })).items[0]?.id).toBe(recreated.memory.id)
    expect(contradicted.contradictedMemory.status).toBe('suppressed')
    expect(contradicted.replacementMemory.status).toBe('active')

    db.close()
  })

  it('does not auto-archive on get/history/delete and honors the automatic sweep cooldown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    const readOnlyCreated = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'read docs before coding',
      statement: 'Read docs before coding.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const deletedCreated = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before merge',
      statement: 'Run tests before merge.',
      origin: 'explicit_user_statement',
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

    const archivedBySearch = await service.searchMemories({
      scope,
      subject: 'read docs before coding',
      limit: 10,
    })
    expect(archivedBySearch.total).toBe(0)
    expect(service.getMemory({ id: readOnlyCreated.memory.id }).status).toBe('archived')

    const cooldownCreated = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'keep commits focused',
      statement: 'Keep commits focused.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (cooldownCreated.decision !== 'create' || !('memory' in cooldownCreated)) {
      throw new Error('Expected cooldown memory creation.')
    }

    db.prepare('UPDATE memories SET last_observed_at = ?, last_reinforced_at = ?, updated_at = ? WHERE id = ?').run(
      '2025-12-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      cooldownCreated.memory.id,
    )

    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'))

    const duringCooldown = await service.searchMemories({
      scope,
      subject: 'keep commits focused',
      limit: 10,
    })
    expect(duringCooldown.total).toBe(1)
    expect(duringCooldown.items[0]?.id).toBe(cooldownCreated.memory.id)
    expect(service.getMemory({ id: cooldownCreated.memory.id }).status).toBe('active')

    memoryRuntimeStateRepository.setLastAutoArchiveSweepAt('2026-04-04T00:00:00.000Z')

    const afterCooldown = await service.searchMemories({
      scope,
      subject: 'keep commits focused',
      limit: 10,
    })
    expect(afterCooldown.total).toBe(0)
    expect(service.getMemory({ id: cooldownCreated.memory.id }).status).toBe('archived')

    db.close()
  })

  it('does not auto-archive stale memories for invalid eligible requests', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'write tests first',
      statement: 'Write tests first.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))
    const initialSweepAt = memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()

    await expect(
      service.searchMemories({
        scope,
        subject: 'write tests first',
        limit: 0,
      }),
    ).rejects.toThrow('Limit must be a positive integer.')
    expect(service.getMemory({ id: created.memory.id }).status).toBe('active')
    expect(service.getMemoryHistory({ id: created.memory.id }).items.map(item => item.eventType)).toEqual(['created'])
    expect(memoryRuntimeStateRepository.getLastAutoArchiveSweepAt()).toBe(initialSweepAt)

    db.close()
  })

  it('archives based on lastReinforcedAt rather than recent retrieval activity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }
    const created = service.applyObservation({
      scope,
      type: 'procedural',
      subject: 'run tests before release',
      statement: 'Run tests before release.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })

    if (created.decision !== 'create' || !('memory' in created)) {
      throw new Error('Expected memory creation.')
    }

    db.prepare(
      'UPDATE memories SET last_observed_at = ?, last_reinforced_at = ?, retrieval_count = ?, last_retrieved_at = ?, strength = ? WHERE id = ?',
    ).run(
      '2025-12-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      6,
      '2026-04-04T00:00:00.000Z',
      2.5,
      created.memory.id,
    )

    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

    const search = await service.searchMemories({
      scope,
      subject: 'run tests before release',
      limit: 10,
    })

    expect(search.total).toBe(0)
    expect(service.getMemory({ id: created.memory.id }).status).toBe('archived')

    db.close()
  })

  it('continues automatic archival across batches without waiting for the cooldown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { db, memoryRuntimeStateRepository, service } = createService()
    const scope: ScopeRef = { type: 'repo', id: '/tmp/example-repo' }

    for (let index = 0; index < 51; index += 1) {
      service.applyObservation({
        scope,
        type: 'procedural',
        subject: `stale memory ${index}`,
        statement: `Stale memory ${index}.`,
        origin: 'explicit_user_statement',
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

  it('canonicalizes existing repo scope paths by realpath and preserves missing repo scope ids', async () => {
    const { db, service } = createService()
    const dir = createTempDir()
    const repoRoot = path.join(dir, 'repo')
    const repoSymlink = path.join(dir, 'repo-link')
    const missingRepoScopeId = path.join(dir, 'missing-repo')

    fs.mkdirSync(repoRoot)
    fs.symlinkSync(repoRoot, repoSymlink)

    const created = service.applyObservation({
      scope: { type: 'repo', id: `${repoSymlink}${path.sep}` },
      type: 'preference',
      subject: 'prefer pnpm',
      statement: 'Use pnpm for this repo.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const realpathSearch = await service.searchMemories({
      scope: { type: 'repo', id: repoRoot },
      subject: 'prefer pnpm',
      limit: 10,
    })
    const trailingSlashSearch = await service.searchMemories({
      scope: { type: 'repo', id: `${repoRoot}${path.sep}` },
      subject: 'prefer pnpm',
      limit: 10,
    })
    const missingCreated = service.applyObservation({
      scope: { type: 'repo', id: missingRepoScopeId },
      type: 'procedural',
      subject: 'run tests before commit',
      statement: 'Run tests before commit.',
      origin: 'explicit_user_statement',
      source: { channel: 'cli' },
    })
    const missingSearch = await service.searchMemories({
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
