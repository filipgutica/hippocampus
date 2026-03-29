import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli/cli.js'
import { buildApp } from '../src/app/build-app.js'

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
})
