import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export type RepoId = string

export const resolveRepoScopeId = (cwd: string): RepoId => {
  const resolvedCwd = path.resolve(cwd)

  try {
    const output = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: resolvedCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    return fs.realpathSync(output)
  } catch {
    return fs.realpathSync(resolvedCwd)
  }
}
