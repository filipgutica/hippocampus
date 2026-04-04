import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const promptMocks = vi.hoisted(() => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => promptMocks)

import { runCli } from '../src/cli/cli.js'
import { buildApp, type RuntimeApp } from '../src/app/build-app.js'
import { runSearchCommand } from '../src/cli/commands/search.command.js'
import { createMcpServer } from '../src/mcp/server.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-cli-test-'))
  tempDirs.push(dir)
  return dir
}

const withAppHome = async (home: string, callback: () => Promise<void>): Promise<void> => {
  const previous = process.env.HIPPOCAMPUS_HOME
  process.env.HIPPOCAMPUS_HOME = home

  try {
    await callback()
  } finally {
    if (previous === undefined) {
      delete process.env.HIPPOCAMPUS_HOME
    } else {
      process.env.HIPPOCAMPUS_HOME = previous
    }
  }
}

const withCwd = async (cwd: string, callback: () => Promise<void>): Promise<void> => {
  const previous = process.cwd()
  process.chdir(cwd)

  try {
    await callback()
  } finally {
    process.chdir(previous)
  }
}

const initializeGitRepo = (repoRoot: string): void => {
  fs.mkdirSync(repoRoot, { recursive: true })
  execFileSync('git', ['init'], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
}

const createIo = () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let stdoutText = ''
  let stderrText = ''

  stdout.on('data', chunk => {
    stdoutText += chunk.toString()
  })
  stderr.on('data', chunk => {
    stderrText += chunk.toString()
  })

  return {
    io: { stdin, stdout, stderr },
    getStdout: () => stdoutText,
    getStderr: () => stderrText,
    setInteractive: (interactive: boolean) => {
      stdin.isTTY = interactive
      stdout.isTTY = interactive
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runCli', () => {
  it('applies and searches memories using command-line flags', async () => {
    const home = createTempDir()
    const scopeId = '/tmp/example-repo'

    await withAppHome(home, async () => {
      const initIo = createIo()
      const applyIo = createIo()
      await runCli(['init'], initIo.io)
      await runCli(
        [
          'apply',
          '--scope-type',
          'repo',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          ' Prefer pnpm ',
          '--statement',
          'Use pnpm for this repo.',
        ],
        applyIo.io,
      )

      const app = await buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      })

      if (app.mode !== 'runtime') {
        throw new Error('Expected runtime app container.')
      }

      try {
        const result = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: scopeId },
          subject: 'prefer pnpm',
          matchMode: 'exact',
          limit: 10,
        })

        expect(result.total).toBe(1)
        expect(result.items[0]?.subjectKey).toBe('prefer pnpm')
      } finally {
        app.close()
      }

      expect(initIo.getStderr()).toBe('')
      expect(applyIo.getStderr()).toBe('')
    })
  })

  it('requires subject for the CLI search command', async () => {
    const home = createTempDir()

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      await expect(
        runCli(['search', '--scope-type', 'repo', '--scope-id', '/tmp/example-repo'], createIo().io),
      ).rejects.toThrow('subject must not be empty for memory-search.')
    })
  })

  it('applies JSON input without requiring a CLI subject flag', async () => {
    const home = createTempDir()

    await withAppHome(home, async () => {
      const initIo = createIo()
      await runCli(['init'], initIo.io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--input',
          JSON.stringify({
            scope: { type: 'repo', id: '/tmp/example-repo' },
            type: 'preference',
            subject: 'Prefer pnpm',
            statement: 'Use pnpm for this repo.',
            origin: 'explicit_user_statement',
          }),
          '--json',
        ],
        applyIo.io,
      )

      const created = JSON.parse(applyIo.getStdout().trim()) as {
        memory?: { id: string; subject: string }
      }

      expect(created.memory?.id).toBeTruthy()
      expect(created.memory?.subject).toBe('Prefer pnpm')
      expect(applyIo.getStderr()).toBe('')
      expect(initIo.getStderr()).toBe('')
    })
  })

  it('includes degraded-mode guidance in human-readable search output', async () => {
    const io = createIo()

    await runSearchCommand(
      {
        memoryService: {
          searchMemories: async () => ({
            items: [],
            total: 0,
            matchMode: 'exact',
            requestedMatchMode: 'hybrid',
            effectiveMatchMode: 'exact',
            fallbackReason: 'Semantic retrieval unavailable; returned exact results only.',
          }),
        },
      } as unknown as RuntimeApp,
      {
        scope: { type: 'repo', id: '/tmp/example-repo' },
        subject: 'prefer pnpm',
        limit: 10,
      },
      io.io,
      false,
    )

    expect(io.getStdout()).toContain('requestedMatchMode: hybrid')
    expect(io.getStdout()).toContain('effectiveMatchMode: exact')
    expect(io.getStdout()).toContain('notice: Semantic retrieval unavailable; returned exact results only.')
    expect(io.getStdout()).toContain('guidance: for broader recall, use memory-list (memories list) with scope + type')
  })

  it('lists, inspects, shows history, and deletes memories via the CLI', async () => {
    const home = createTempDir()
    const scopeId = '/tmp/example-repo'

    await withAppHome(home, async () => {
      const initIo = createIo()
      await runCli(['init'], initIo.io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'repo',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer pnpm',
          '--statement',
          'Use pnpm for this repo.',
          '--json',
        ],
        applyIo.io,
      )

      const created = JSON.parse(applyIo.getStdout().trim()) as {
        memory?: { id: string }
      }
      const memoryId = created.memory?.id

      expect(memoryId).toBeTruthy()

      const listIo = createIo()
      await runCli(['memories', 'list', '--scope-type', 'repo', '--scope-id', scopeId, '--json'], listIo.io)
      const listResult = JSON.parse(listIo.getStdout().trim()) as { total: number }
      expect(listResult.total).toBe(1)

      const inspectIo = createIo()
      await runCli(['memories', 'inspect', '--id', memoryId!, '--json'], inspectIo.io)
      const inspectResult = JSON.parse(inspectIo.getStdout().trim()) as {
        id: string
        status: string
        origin: string
        supersededByMemory: unknown
      }
      expect(inspectResult.id).toBe(memoryId)
      expect(inspectResult.status).toBe('active')
      expect(inspectResult.origin).toBe('explicit_user_statement')
      expect(inspectResult.supersededByMemory).toBeNull()

      const historyIo = createIo()
      await runCli(['memories', 'history', '--id', memoryId!, '--json'], historyIo.io)
      const historyResult = JSON.parse(historyIo.getStdout().trim()) as { total: number }
      expect(historyResult.total).toBe(1)

      const deleteIo = createIo()
      await runCli(['memories', 'delete', '--id', memoryId!, '--json'], deleteIo.io)
      const deleteResult = JSON.parse(deleteIo.getStdout().trim()) as { memory: { status: string } }
      expect(deleteResult.memory.status).toBe('deleted')

      const app = await buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      })

      if (app.mode !== 'runtime') {
        throw new Error('Expected runtime app container.')
      }

      try {
        const result = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: scopeId },
          subject: 'prefer pnpm',
          matchMode: 'exact',
          limit: 10,
        })

        expect(result.total).toBe(0)
      } finally {
        app.close()
      }

      expect(listIo.getStderr()).toBe('')
      expect(inspectIo.getStderr()).toBe('')
      expect(historyIo.getStderr()).toBe('')
      expect(deleteIo.getStderr()).toBe('')
      expect(initIo.getStderr()).toBe('')
    })
  })

  it('archives stale memories via the CLI and supports dry runs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const home = createTempDir()
    const scopeId = 'cli-user'

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      await runCli(
        [
          'apply',
          '--scope-type',
          'user',
          '--scope-id',
          scopeId,
          '--type',
          'procedural',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Run tests before commit',
          '--statement',
          'Run tests before commit.',
          '--json',
        ],
        createIo().io,
      )

      vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

      const dryRunIo = createIo()
      await runCli(['memories', 'archive-stale', '--dry-run', '--json'], dryRunIo.io)
      const dryRunResult = JSON.parse(dryRunIo.getStdout().trim()) as {
        dryRun: boolean
        olderThanDays: number | null
        cutoffByScope: Record<'user' | 'repo' | 'org', string>
        total: number
        items: Array<{ status: string }>
      }

      expect(dryRunResult.dryRun).toBe(true)
      expect(dryRunResult.olderThanDays).toBeNull()
      expect(Object.keys(dryRunResult.cutoffByScope)).toEqual(['user', 'repo', 'org'])
      expect(dryRunResult.total).toBe(1)
      expect(dryRunResult.items[0]?.status).toBe('active')

      const archiveIo = createIo()
      await runCli(['memories', 'archive-stale', '--json'], archiveIo.io)
      const archiveResult = JSON.parse(archiveIo.getStdout().trim()) as {
        dryRun: boolean
        olderThanDays: number | null
        cutoffByScope: Record<'user' | 'repo' | 'org', string>
        total: number
        items: Array<{ status: string; id: string }>
      }

      expect(archiveResult.dryRun).toBe(false)
      expect(archiveResult.olderThanDays).toBeNull()
      expect(Object.keys(archiveResult.cutoffByScope)).toEqual(['user', 'repo', 'org'])
      expect(archiveResult.total).toBe(1)
      expect(archiveResult.items[0]?.status).toBe('archived')

      const inspectIo = createIo()
      await runCli(['memories', 'inspect', '--id', archiveResult.items[0]!.id, '--json'], inspectIo.io)
      const inspectResult = JSON.parse(inspectIo.getStdout().trim()) as { status: string }
      expect(inspectResult.status).toBe('archived')
    })
  })

  it('archives stale memories automatically before list and search without resurrecting them', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const home = createTempDir()
    const scopeId = 'cli-user'

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'user',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer pnpm',
          '--statement',
          'Use pnpm for this repo.',
          '--json',
        ],
        applyIo.io,
      )

      const created = JSON.parse(applyIo.getStdout().trim()) as { memory: { id: string } }

      vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'))

      const listIo = createIo()
      await runCli(['memories', 'list', '--scope-type', 'user', '--scope-id', scopeId, '--json'], listIo.io)
      const listResult = JSON.parse(listIo.getStdout().trim()) as { total: number }
      expect(listResult.total).toBe(0)

      const inspectIo = createIo()
      await runCli(['memories', 'inspect', '--id', created.memory.id, '--json'], inspectIo.io)
      const inspectResult = JSON.parse(inspectIo.getStdout().trim()) as { status: string }
      expect(inspectResult.status).toBe('archived')

      const reapplyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'user',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer pnpm',
          '--statement',
          'Use pnpm for this repo.',
          '--json',
        ],
        reapplyIo.io,
      )

      const recreated = JSON.parse(reapplyIo.getStdout().trim()) as {
        decision: string
        memory: { id: string }
      }

      expect(recreated.decision).toBe('create')
      expect(recreated.memory.id).not.toBe(created.memory.id)
    })
  })

  it('supports manual archival threshold overrides from the CLI', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const home = createTempDir()
    const scopeId = '/tmp/example-repo'

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'repo',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer concise summaries',
          '--statement',
          'Prefer concise summaries.',
          '--json',
        ],
        applyIo.io,
      )

      const created = JSON.parse(applyIo.getStdout().trim()) as { memory: { id: string } }

      vi.setSystemTime(new Date('2026-03-15T00:00:00.000Z'))

      const archiveIo = createIo()
      await runCli(['memories', 'archive-stale', '--older-than-days', '60', '--json'], archiveIo.io)
      const archiveResult = JSON.parse(archiveIo.getStdout().trim()) as {
        olderThanDays: number
        cutoffByScope: Record<'user' | 'repo' | 'org', string>
        total: number
        items: Array<{ id: string; status: string }>
      }

      expect(archiveResult.olderThanDays).toBe(60)
      expect(new Set(Object.values(archiveResult.cutoffByScope)).size).toBe(1)
      expect(archiveResult.total).toBe(1)
      expect(archiveResult.items[0]?.id).toBe(created.memory.id)
      expect(archiveResult.items[0]?.status).toBe('archived')
    })
  })

  it('prompts for memory id and confirmation before deleting in an interactive terminal', async () => {
    const home = createTempDir()
    const scopeId = '/tmp/example-repo'

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'repo',
          '--scope-id',
          scopeId,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer pnpm',
          '--statement',
          'Use pnpm for this repo.',
          '--json',
        ],
        applyIo.io,
      )

      const created = JSON.parse(applyIo.getStdout().trim()) as { memory: { id: string } }
      promptMocks.input.mockResolvedValue(created.memory.id)
      promptMocks.confirm.mockResolvedValue(true)

      const deleteIo = createIo()
      deleteIo.setInteractive(true)

      await runCli(['memories', 'delete'], deleteIo.io)

      expect(deleteIo.getStdout()).toContain('memory deleted.')
      expect(promptMocks.input).toHaveBeenCalledTimes(1)
      expect(promptMocks.confirm).toHaveBeenCalledTimes(1)

      const inspectIo = createIo()
      await runCli(['memories', 'inspect', '--id', created.memory.id, '--json'], inspectIo.io)
      const inspectResult = JSON.parse(inspectIo.getStdout().trim()) as { status: string }
      expect(inspectResult.status).toBe('deleted')
    })
  })

  it('requires --id for memories delete outside an interactive terminal', async () => {
    const home = createTempDir()

    await withAppHome(home, async () => {
      await runCli(['init'], createIo().io)

      await expect(runCli(['memories', 'delete'], createIo().io)).rejects.toThrow(
        'memories delete requires --id outside an interactive terminal.',
      )
    })
  })

  it('canonicalizes repo scope ids consistently between CLI writes and MCP reads', async () => {
    const home = createTempDir()
    const repoRoot = path.join(home, 'repo')
    const repoSymlink = path.join(home, 'repo-link')

    initializeGitRepo(repoRoot)
    fs.symlinkSync(repoRoot, repoSymlink)

    await withAppHome(home, async () => {
      const initIo = createIo()
      await runCli(['init'], initIo.io)

      const applyIo = createIo()
      await runCli(
        [
          'apply',
          '--scope-type',
          'repo',
          '--scope-id',
          `${repoSymlink}${path.sep}`,
          '--type',
          'preference',
          '--origin',
          'explicit_user_statement',
          '--subject',
          'Prefer pnpm',
          '--statement',
          'Use pnpm for this repo.',
          '--json',
        ],
        applyIo.io,
      )

      const app = await buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      })

      if (app.mode !== 'runtime') {
        throw new Error('Expected runtime app container.')
      }

      const mcp = createMcpServer(app.memoryService)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'hippo-cli-mcp-test', version: '1.0.0' })

      try {
        await mcp.server.connect(serverTransport)
        await client.connect(clientTransport)

        const searched = await client.callTool({
          name: 'memory-search',
          arguments: {
            scope: { type: 'repo', id: repoRoot },
            subject: 'prefer pnpm',
            matchMode: 'exact',
            limit: 10,
          },
        })
        const searchResult = JSON.parse(
          Array.isArray(searched.content) && searched.content[0] && 'text' in searched.content[0]
            ? searched.content[0].text
            : '',
        ) as { total: number; items: Array<{ scope: { id: string } }> }

        expect(searchResult.total).toBe(1)
        expect(searchResult.items[0]?.scope.id).toBe(fs.realpathSync(repoRoot))
      } finally {
        await client.close()
        await mcp.server.close()
        app.close()
      }
    })
  })

  it('keeps explicit repo subdirectory scopes distinct while CLI omitted scope id still resolves to repo root', async () => {
    const home = createTempDir()
    const repoRoot = path.join(home, 'repo')
    const repoSubdir = path.join(repoRoot, 'packages', 'app')

    initializeGitRepo(repoRoot)
    fs.mkdirSync(repoSubdir, { recursive: true })

    await withAppHome(home, async () => {
      const initIo = createIo()
      await runCli(['init'], initIo.io)

      await withCwd(repoSubdir, async () => {
        const applyIo = createIo()
        await runCli(
          [
            'apply',
            '--type',
            'procedural',
            '--origin',
            'explicit_user_statement',
            '--subject',
            'Run tests before commit',
            '--statement',
            'Run tests before commit.',
            '--json',
          ],
          applyIo.io,
        )
      })

      const app = await buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      })

      if (app.mode !== 'runtime') {
        throw new Error('Expected runtime app container.')
      }

      const mcp = createMcpServer(app.memoryService)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'hippo-cli-subdir-test', version: '1.0.0' })

      try {
        await mcp.server.connect(serverTransport)
        await client.connect(clientTransport)

        const repoRootSearch = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoRoot },
          subject: 'run tests before commit',
          matchMode: 'exact',
          limit: 10,
        })
        const repoSubdirSearch = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoSubdir },
          subject: 'run tests before commit',
          matchMode: 'exact',
          limit: 10,
        })

        expect(repoRootSearch.total).toBe(1)
        expect(repoSubdirSearch.total).toBe(0)

        await client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: repoSubdir },
            type: 'procedural',
            subject: 'Use package-local scripts',
            statement: 'Use package-local scripts in this subdirectory.',
            origin: 'tool_observation',
          },
        })

        const rootScopedMemory = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoRoot },
          subject: 'use package-local scripts',
          matchMode: 'exact',
          limit: 10,
        })
        const subdirScopedMemory = await app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoSubdir },
          subject: 'use package-local scripts',
          matchMode: 'exact',
          limit: 10,
        })

        expect(rootScopedMemory.total).toBe(0)
        expect(subdirScopedMemory.total).toBe(1)
      } finally {
        await client.close()
        await mcp.server.close()
        app.close()
      }
    })
  })
})
