import type Database from 'better-sqlite3'
import { AppError } from '../common/errors.js'
import { APP_CONFIG_SCHEMA_VERSION, type AppConfig } from './config.js'

const OWNERSHIP_TABLES = ['users', 'projects'] as const
const REQUIRED_MEMORY_COLUMNS = ['user_id', 'project_id'] as const

const hasTable = (db: InstanceType<typeof Database>, tableName: string): boolean => {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
      `,
    )
    .get(tableName) as { name: string } | undefined

  return row?.name === tableName
}

const getColumnNames = (db: InstanceType<typeof Database>, tableName: string): Set<string> => {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return new Set(rows.map(row => row.name))
}

export const assertRuntimeCompatibility = ({
  config,
  db,
}: {
  config: AppConfig
  db: InstanceType<typeof Database>
}): void => {
  if (config.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) {
    throw new AppError(
      'RESET_REQUIRED',
      'Existing Hippocampus config/database state predates the ownership redesign. Reset local state and run `hippo init` again.',
    )
  }

  for (const tableName of OWNERSHIP_TABLES) {
    if (!hasTable(db, tableName)) {
      throw new AppError(
        'RESET_REQUIRED',
        'Existing Hippocampus database state predates the ownership redesign. Reset local state and run `hippo init` again.',
      )
    }
  }

  const memoryColumns = getColumnNames(db, 'memories')
  for (const columnName of REQUIRED_MEMORY_COLUMNS) {
    if (!memoryColumns.has(columnName)) {
      throw new AppError(
        'RESET_REQUIRED',
        'Existing Hippocampus database state predates the ownership redesign. Reset local state and run `hippo init` again.',
      )
    }
  }
}
