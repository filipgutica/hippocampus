import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli/cli.js'
import { buildApp } from '../src/app/build-app.js'
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
    io: { stdout, stderr },
    getStdout: () => stdoutText,
    getStderr: () => stderrText,
  }
}

afterEach(() => {
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
          '--kind',
          'preference',
          '--source-type',
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
        const result = app.memoryService.searchMemories({
          scope: { type: 'repo', id: scopeId },
          subject: 'prefer pnpm',
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
          '--kind',
          'preference',
          '--source-type',
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
        sourceType: string
        supersededByMemory: unknown
      }
      expect(inspectResult.id).toBe(memoryId)
      expect(inspectResult.status).toBe('active')
      expect(inspectResult.sourceType).toBe('explicit_user_statement')
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
        const result = app.memoryService.searchMemories({
          scope: { type: 'repo', id: scopeId },
          subject: 'prefer pnpm',
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
          '--kind',
          'preference',
          '--source-type',
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
            '--kind',
            'workflow',
            '--source-type',
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

        const repoRootSearch = app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoRoot },
          subject: 'run tests before commit',
          limit: 10,
        })
        const repoSubdirSearch = app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoSubdir },
          subject: 'run tests before commit',
          limit: 10,
        })

        expect(repoRootSearch.total).toBe(1)
        expect(repoSubdirSearch.total).toBe(0)

        await client.callTool({
          name: 'memory-apply-observation',
          arguments: {
            scope: { type: 'repo', id: repoSubdir },
            kind: 'workflow',
            subject: 'Use package-local scripts',
            statement: 'Use package-local scripts in this subdirectory.',
            sourceType: 'tool_observation',
          },
        })

        const rootScopedMemory = app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoRoot },
          subject: 'use package-local scripts',
          limit: 10,
        })
        const subdirScopedMemory = app.memoryService.searchMemories({
          scope: { type: 'repo', id: repoSubdir },
          subject: 'use package-local scripts',
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
