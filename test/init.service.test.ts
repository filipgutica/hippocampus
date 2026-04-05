import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAppPaths } from '../src/app/paths.js'
import { InitService } from '../src/app/init.service.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('InitService', () => {
  it('creates the app directory, config, and database idempotently', () => {
    const home = createTempDir()
    const paths = resolveAppPaths(home)
    const service = new InitService(paths)

    const first = service.initialize()
    const second = service.ensureInitialized()

    expect(fs.existsSync(paths.home)).toBe(true)
    expect(fs.existsSync(paths.configFile)).toBe(true)
    expect(fs.existsSync(paths.dbFile)).toBe(true)
    expect(first.initialized).toBe(true)
    expect(second.initialized).toBe(false)
    expect(first.config.dbFile).toBe(paths.dbFile)
    expect(first.config.currentUserId).toBeTruthy()

    const db = new Database(paths.dbFile)
    const users = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>
    db.close()

    expect(users).toEqual([{ id: first.config.currentUserId }])
  })
})
