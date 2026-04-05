import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type AppConfig = {
  schemaVersion: number
  dbFile: string
  currentUserId: string
  createdAt: string
}

export const APP_CONFIG_SCHEMA_VERSION = 2

export const defaultConfig = ({ dbFile }: { dbFile: string }): AppConfig => ({
  schemaVersion: APP_CONFIG_SCHEMA_VERSION,
  dbFile,
  currentUserId: randomUUID(),
  createdAt: new Date().toISOString(),
})

export const readConfig = (filePath: string): AppConfig | null => {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as AppConfig
}

export const writeConfig = (filePath: string, config: AppConfig): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}
