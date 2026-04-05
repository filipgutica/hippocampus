import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import type { ProjectIdentitySource } from './project.types.js'

const runGit = ({
  args,
  cwd,
}: {
  args: string[]
  cwd: string
}): string | null => {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    return output.length > 0 ? output : null
  } catch {
    return null
  }
}

const normalizeRemoteUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return trimmed
  }

  const sshMatch = trimmed.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/i)
  if (sshMatch) {
    const [, host, repoPath] = sshMatch
    return `${host.toLowerCase()}/${repoPath.replace(/\.git$/i, '').replace(/^\/+/, '')}`
  }

  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname.replace(/\.git$/i, '').replace(/^\/+/, '')
    return pathname.length > 0 ? `${host}/${pathname}` : host
  } catch {
    return trimmed.replace(/\.git$/i, '')
  }
}

const resolveGitDir = (repoRoot: string): string => {
  const gitDir = runGit({
    args: ['rev-parse', '--git-dir'],
    cwd: repoRoot,
  })

  if (!gitDir) {
    throw new Error(`Unable to resolve git metadata for project at ${repoRoot}.`)
  }

  return path.isAbsolute(gitDir) ? gitDir : path.join(repoRoot, gitDir)
}

const resolveLocalProjectIdPath = (repoRoot: string): string => path.join(resolveGitDir(repoRoot), 'hippocampus', 'project-id')

const readOrCreateLocalProjectIdentity = (repoRoot: string): string => {
  const identityPath = resolveLocalProjectIdPath(repoRoot)

  try {
    const existing = fs.readFileSync(identityPath, 'utf8').trim()
    if (existing) {
      return existing
    }
  } catch {
    // Fall through to create the repo-local identity.
  }

  const nextIdentity = randomUUID()
  fs.mkdirSync(path.dirname(identityPath), { recursive: true })
  fs.writeFileSync(identityPath, `${nextIdentity}\n`, 'utf8')
  return nextIdentity
}

export const resolveProjectRepoRoot = (cwd: string): string | null => {
  const resolvedCwd = path.resolve(cwd)
  const repoRoot = runGit({
    args: ['rev-parse', '--show-toplevel'],
    cwd: resolvedCwd,
  })

  if (!repoRoot) {
    return null
  }

  return fs.realpathSync(repoRoot)
}

export const inspectProjectPath = ({
  inputPath,
  allowCreateLocalIdentity,
}: {
  inputPath: string
  allowCreateLocalIdentity: boolean
}): {
  repoRoot: string
  identitySource: ProjectIdentitySource
  identityValue: string
} => {
  const repoRoot = resolveProjectRepoRoot(inputPath)
  if (!repoRoot) {
    throw new Error(`No git repository found for project path ${inputPath}.`)
  }

  const remoteUrl = runGit({
    args: ['config', '--get', 'remote.origin.url'],
    cwd: repoRoot,
  })

  if (remoteUrl) {
    return {
      repoRoot,
      identitySource: 'remote_url',
      identityValue: normalizeRemoteUrl(remoteUrl),
    }
  }

  if (!allowCreateLocalIdentity) {
    const localIdentityPath = resolveLocalProjectIdPath(repoRoot)
    try {
      const existing = fs.readFileSync(localIdentityPath, 'utf8').trim()
      if (existing) {
        return {
          repoRoot,
          identitySource: 'local_uuid',
          identityValue: existing,
        }
      }
    } catch {
      return {
        repoRoot,
        identitySource: 'local_uuid',
        identityValue: '',
      }
    }
  }

  return {
    repoRoot,
    identitySource: 'local_uuid',
    identityValue: readOrCreateLocalProjectIdentity(repoRoot),
  }
}
