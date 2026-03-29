import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-smoke-init-'))

try {
  execFileSync(globalThis.process.execPath, ['dist/index.js', 'init', '--json'], {
    cwd: globalThis.process.cwd(),
    env: {
      ...globalThis.process.env,
      HIPPOCAMPUS_HOME: home,
    },
    stdio: 'pipe',
  })

  const configFile = path.join(home, 'config.json')
  const dbFile = path.join(home, 'hippocampus.db')

  if (!fs.existsSync(configFile)) {
    throw new Error(`Expected ${configFile} to exist after init.`)
  }

  if (!fs.existsSync(dbFile)) {
    throw new Error(`Expected ${dbFile} to exist after init.`)
  }
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}
