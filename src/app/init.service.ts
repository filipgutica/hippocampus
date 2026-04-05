import fs from 'node:fs'
import { defaultConfig, readConfig, writeConfig, type AppConfig } from './config.js'
import type { AppPaths } from './paths.js'
import { initializeDatabase } from '../common/db/db.js'
import { MemoryOwnershipRepository } from '../memory/memory-ownership.repository.js'
import { assertRuntimeCompatibility } from './runtime-compatibility.js'

export type InitResult = {
  initialized: boolean
  paths: AppPaths
  config: AppConfig
}

export class InitService {
  private readonly paths: AppPaths

  constructor(paths: AppPaths) {
    this.paths = paths
  }

  initialize(): InitResult {
    fs.mkdirSync(this.paths.home, { recursive: true })

    const existingConfig = readConfig(this.paths.configFile)
    const config = existingConfig ?? defaultConfig({ dbFile: this.paths.dbFile })
    if (!existingConfig) {
      writeConfig(this.paths.configFile, config)
    }

    const db = initializeDatabase(config.dbFile)
    assertRuntimeCompatibility({ config, db })
    new MemoryOwnershipRepository({
      db,
      currentUserId: config.currentUserId,
    }).ensureCurrentUser(new Date().toISOString())
    db.close()

    return {
      initialized: true,
      paths: this.paths,
      config,
    }
  }

  ensureInitialized(): InitResult {
    const configExists = fs.existsSync(this.paths.configFile)
    const dbExists = fs.existsSync(this.paths.dbFile)

    if (!configExists || !dbExists) {
      return this.initialize()
    }

    const config = readConfig(this.paths.configFile)
    if (!config) {
      return this.initialize()
    }

    const db = initializeDatabase(config.dbFile)
    assertRuntimeCompatibility({ config, db })
    new MemoryOwnershipRepository({
      db,
      currentUserId: config.currentUserId,
    }).ensureCurrentUser(new Date().toISOString())
    db.close()

    return {
      initialized: false,
      paths: this.paths,
      config,
    }
  }

  isInitialized(): boolean {
    return fs.existsSync(this.paths.configFile) && fs.existsSync(this.paths.dbFile)
  }
}
