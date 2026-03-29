import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations.js'

export const ensureParentDirectory = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

export const openDatabase = (filePath: string): InstanceType<typeof Database> => {
  ensureParentDirectory(filePath)
  return new Database(filePath)
}

export const initializeDatabase = (filePath: string): InstanceType<typeof Database> => {
  const db = openDatabase(filePath)
  runMigrations(db)
  return db
}

export const runTransaction = <T>(db: InstanceType<typeof Database>, callback: () => T): T => db.transaction(callback)()
