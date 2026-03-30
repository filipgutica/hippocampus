import os from 'node:os'
import path from 'node:path'
import { canonicalizePath } from '../common/utils.js'

export type AppPaths = {
  home: string
  configFile: string
  dbFile: string
  transformersCacheDir: string
}

export const resolveAppPaths = (overrideHome?: string): AppPaths => {
  const home = canonicalizePath(overrideHome ?? process.env.HIPPOCAMPUS_HOME ?? path.join(os.homedir(), '.hippocampus'))

  return {
    home,
    configFile: path.join(home, 'config.json'),
    dbFile: path.join(home, 'hippocampus.db'),
    transformersCacheDir: path.join(home, 'cache', 'transformers'),
  }
}
