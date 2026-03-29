import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-smoke-mcp-'))

const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise(resolve => globalThis.setTimeout(resolve, 50))
  }

  throw new Error('Timed out waiting for lazy initialization.')
}

const child = spawn(globalThis.process.execPath, ['dist/index.js', 'mcp', 'serve'], {
  cwd: globalThis.process.cwd(),
  env: {
    ...globalThis.process.env,
    HIPPOCAMPUS_HOME: home,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

try {
  await waitFor(() => fs.existsSync(path.join(home, 'config.json')) && fs.existsSync(path.join(home, 'hippocampus.db')))
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await new Promise(resolve => child.once('exit', resolve))
  }
  fs.rmSync(home, { recursive: true, force: true })
}
