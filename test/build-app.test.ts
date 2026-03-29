import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-build-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildApp', () => {
  it('lazily initializes local state for runtime mode', async () => {
    const home = createTempDir()

    const app = await buildApp({
      mode: 'runtime',
      allowLazyInit: true,
      appHomeOverride: home,
    })

    if (app.mode !== 'runtime') {
      throw new Error('Expected runtime app container.')
    }

    expect(fs.existsSync(path.join(home, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(home, 'hippocampus.db'))).toBe(true)
    expect(app.mode).toBe('runtime')

    app.close()
  })
})
