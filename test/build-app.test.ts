import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app/build-app.js'
import { APP_CONFIG_SCHEMA_VERSION, writeConfig } from '../src/app/config.js'
import { resolveAppPaths } from '../src/app/paths.js'

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

    const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')) as { currentUserId?: string }
    expect(config.currentUserId).toBeTruthy()

    app.close()
  })

  it('fails fast when config predates the ownership redesign', async () => {
    const home = createTempDir()
    const paths = resolveAppPaths(home)
    fs.mkdirSync(paths.home, { recursive: true })
    writeConfig(paths.configFile, {
      schemaVersion: 1,
      dbFile: paths.dbFile,
      currentUserId: 'legacy-user',
      createdAt: new Date().toISOString(),
    })
    new Database(paths.dbFile).close()

    await expect(
      buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      }),
    ).rejects.toThrow('Reset local state and run `hippo init` again.')
  })

  it('fails fast when the database shape predates ownership tables', async () => {
    const home = createTempDir()
    const paths = resolveAppPaths(home)
    fs.mkdirSync(paths.home, { recursive: true })
    writeConfig(paths.configFile, {
      schemaVersion: APP_CONFIG_SCHEMA_VERSION,
      dbFile: paths.dbFile,
      currentUserId: 'current-user',
      createdAt: new Date().toISOString(),
    })

    const db = new Database(paths.dbFile)
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at) VALUES
        (1, 'current_memory_schema', '2026-04-04T00:00:00.000Z');
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        statement TEXT NOT NULL,
        details TEXT,
        origin TEXT NOT NULL,
        reinforcement_count INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        last_reinforced_at TEXT NOT NULL,
        retrieval_count INTEGER NOT NULL DEFAULT 0,
        last_retrieved_at TEXT,
        strength REAL NOT NULL DEFAULT 1.0,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT,
        deleted_at TEXT
      );
    `)
    db.close()

    await expect(
      buildApp({
        mode: 'runtime',
        appHomeOverride: home,
      }),
    ).rejects.toThrow('Reset local state and run `hippo init` again.')
  })
})
