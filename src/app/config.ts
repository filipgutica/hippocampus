import fs from 'node:fs'
import path from 'node:path'

export type AppConfig = {
  schemaVersion: number
  dbFile: string
  createdAt: string
}

export const defaultConfig = ({ dbFile }: { dbFile: string }): AppConfig => ({
  schemaVersion: 1,
  dbFile,
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
