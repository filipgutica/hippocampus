import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
      await runCli(['init'])
      await runCli([
        'apply',
        '--scope-type',
        'repo',
        '--scope-id',
        scopeId,
        '--kind',
        'preference',
        '--subject',
        ' Prefer pnpm ',
        '--statement',
        'Use pnpm for this repo.',
      ])

      const app = await buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      })

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
    })
  })
})
