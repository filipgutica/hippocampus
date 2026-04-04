import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli/cli.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-setup-test-'))
  tempDirs.push(dir)
  return dir
}

const createIo = () => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let stdoutText = ''
  let stderrText = ''

  stdout.on('data', chunk => {
    stdoutText += chunk.toString()
  })
  stderr.on('data', chunk => {
    stderrText += chunk.toString()
  })

  return {
    io: { stdout, stderr },
    getStdout: () => stdoutText,
    getStderr: () => stderrText,
  }
}

const withEnv = async (key: string, value: string, callback: () => Promise<void>): Promise<void> => {
  const previous = process.env[key]
  process.env[key] = value

  try {
    await callback()
  } finally {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('setup command', () => {
  it('installs the Claude SessionStart hook, MCP server, and installer state', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const io = createIo()
      await runCli(['setup', 'claude'], io.io)

      const settingsPath = path.join(home, '.claude', 'settings.json')
      const claudeConfigPath = path.join(home, '.claude.json')
      const installerStatePath = path.join(home, '.hippocampus', 'installer-state.json')
      const scriptPath = path.join(home, '.hippocampus', 'bootstrap', 'claude-session-start.mjs')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
        hooks?: {
          SessionStart?: Array<{
            matcher?: string
            hooks: Array<{
              type: string
              command: string
            }>
          }>
        }
      }
      const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8')) as {
        mcpServers?: {
          hippo?: {
            type?: string
            command?: string
            args?: string[]
          }
        }
      }
      const installerState = JSON.parse(fs.readFileSync(installerStatePath, 'utf8')) as {
        claude?: { ownsMcpServer?: boolean }
      }

      expect(fs.existsSync(scriptPath)).toBe(true)
      const scriptContent = fs.readFileSync(scriptPath, 'utf8')
      expect(scriptContent).toContain('memory-list')
      expect(scriptContent).toContain('hookSpecificOutput')
      expect(settings.hooks?.SessionStart).toHaveLength(1)
      expect(settings.hooks?.SessionStart?.[0]?.hooks[0]?.command).toContain(scriptPath)
      expect(claudeConfig.mcpServers?.hippo?.type).toBe('stdio')
      expect(claudeConfig.mcpServers?.hippo?.command).toBe('npx')
      expect(claudeConfig.mcpServers?.hippo?.args).toEqual(['-y', 'hippocampus', 'mcp', 'serve'])
      expect(installerState.claude?.ownsMcpServer).toBe(true)
      expect(io.getStderr()).toBe('')
    })
  })

  it('preserves sibling Claude hooks and user-managed Claude MCP config', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const claudeDir = path.join(home, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                {
                  hooks: [
                    { type: 'command', command: 'echo existing-one' },
                    { type: 'command', command: 'echo existing-two' },
                  ],
                },
              ],
            },
          },
          null,
          2,
        ),
        'utf8',
      )
      fs.writeFileSync(
        path.join(home, '.claude.json'),
        JSON.stringify(
          {
            mcpServers: {
              hippo: {
                type: 'stdio',
                command: 'custom-hippo',
                args: ['serve'],
                env: { HIPPO: '1' },
              },
            },
          },
          null,
          2,
        ),
        'utf8',
      )

      const io = createIo()
      await runCli(['setup', 'claude'], io.io)

      const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8')) as {
        hooks?: { SessionStart?: Array<{ hooks: Array<{ command: string }> }> }
      }
      const config = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
        mcpServers?: { hippo?: { command?: string; env?: Record<string, string> } }
      }

      expect(settings.hooks?.SessionStart).toHaveLength(2)
      expect(settings.hooks?.SessionStart?.[0]?.hooks).toHaveLength(2)
      expect(config.mcpServers?.hippo?.command).toBe('custom-hippo')
      expect(config.mcpServers?.hippo?.env).toEqual({ HIPPO: '1' })
      expect(io.getStdout()).toContain('skipped: existing user-managed Claude mcpServers.hippo was preserved.')
    })
  })

  it('installs Codex SessionStart hook and managed MCP block without touching sibling hooks', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const codexDir = path.join(home, '.codex')
      fs.mkdirSync(codexDir, { recursive: true })
      fs.writeFileSync(
        path.join(codexDir, 'hooks.json'),
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                {
                  matcher: 'startup',
                  hooks: [
                    {
                      type: 'command',
                      command: 'echo existing-one',
                    },
                    {
                      type: 'command',
                      command: 'echo existing-two',
                    },
                  ],
                },
              ],
            },
          },
          null,
          2,
        ),
        'utf8',
      )

      const io = createIo()
      await runCli(['setup', 'codex'], io.io)
      await runCli(['setup', 'codex'], io.io)

      const hooksPath = path.join(home, '.codex', 'hooks.json')
      const configPath = path.join(home, '.codex', 'config.toml')
      const scriptPath = path.join(home, '.hippocampus', 'bootstrap', 'codex-session-start.mjs')
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8')) as {
        hooks?: {
          SessionStart?: Array<{
            matcher?: string
            hooks: Array<{
              type: string
              command: string
              statusMessage?: string
            }>
          }>
        }
      }
      const configText = fs.readFileSync(configPath, 'utf8')

      expect(fs.existsSync(scriptPath)).toBe(true)
      expect(fs.readFileSync(scriptPath, 'utf8')).toContain('hookSpecificOutput')
      expect(hooks.hooks?.SessionStart).toHaveLength(2)
      expect(hooks.hooks?.SessionStart?.[0]?.hooks).toHaveLength(2)
      expect(hooks.hooks?.SessionStart?.[1]?.matcher).toBe('startup|resume')
      expect(hooks.hooks?.SessionStart?.[1]?.hooks[0]?.command).toContain(scriptPath)
      expect(configText).toContain('# hippo-mcp:start')
      expect(configText).toContain('[mcp_servers.hippo]')
      expect(configText).toContain('[features]')
      expect(configText).toContain('codex_hooks = true')
      expect(configText.match(/\[mcp_servers\.hippo\]/g)).toHaveLength(1)
      expect(io.getStderr()).toBe('')
    })
  })

  it('leaves an unmanaged Codex hippo MCP table untouched', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const codexDir = path.join(home, '.codex')
      fs.mkdirSync(codexDir, { recursive: true })
      fs.writeFileSync(
        path.join(codexDir, 'config.toml'),
        ['[mcp_servers.hippo]', 'command = "custom"', 'args = ["serve"]'].join('\n'),
        'utf8',
      )

      const io = createIo()
      await runCli(['setup', 'codex'], io.io)

      expect(io.getStdout()).toContain('skipped: existing user-managed Codex [mcp_servers.hippo] was preserved.')
      expect(io.getStderr()).toBe('')
    })
  })

  it('throws when config.toml has hippo-mcp:start without hippo-mcp:end', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const codexDir = path.join(home, '.codex')
      fs.mkdirSync(codexDir, { recursive: true })
      fs.writeFileSync(
        path.join(codexDir, 'config.toml'),
        ['[other_section]', 'key = "value"', '', '# hippo-mcp:start', '[mcp_servers.hippo]', 'command = "npx"'].join(
          '\n',
        ),
        'utf8',
      )

      const io = createIo()
      await expect(runCli(['setup', 'codex'], io.io)).rejects.toThrow(
        'hippo-mcp:start found without hippo-mcp:end in TOML config',
      )
    })
  })

  it('supports dry-run output without writing Codex files', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const io = createIo()
      await runCli(['setup', 'codex', '--dry-run'], io.io)

      expect(fs.existsSync(path.join(home, '.codex', 'hooks.json'))).toBe(false)
      expect(fs.existsSync(path.join(home, '.codex', 'config.toml'))).toBe(false)
      expect(fs.existsSync(path.join(home, '.hippocampus', 'bootstrap', 'codex-session-start.mjs'))).toBe(false)
      expect(io.getStdout()).toContain('dry run: Codex memory bootstrap would be installed.')
      expect(io.getStdout()).toContain('bootstrap text:')
    })
  })

  it('supports dry-run output for shell setup without writing the rc file', async () => {
    const home = createTempDir()
    const repo = createTempDir()
    const rcFile = path.join(home, '.zshrc')

    fs.mkdirSync(path.join(repo, 'dist'), { recursive: true })
    fs.writeFileSync(rcFile, 'export FOO="bar"\n', 'utf8')

    const previousCwd = process.cwd()
    process.chdir(repo)

    try {
      await withEnv('HOME', home, async () => {
        const before = fs.readFileSync(rcFile, 'utf8')
        const io = createIo()
        await runCli(['setup', 'shell', rcFile, '--dry-run'], io.io)

        expect(fs.readFileSync(rcFile, 'utf8')).toBe(before)
        expect(io.getStdout()).toContain('dry run: shell PATH bootstrap would be installed.')
        expect(io.getStdout()).toContain('# hippo mcp')
        expect(io.getStderr()).toBe('')
      })
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('installs a shell PATH block for local development and avoids duplicates', async () => {
    const home = createTempDir()
    const repo = createTempDir()
    const rcFile = path.join(home, '.zshrc')

    fs.mkdirSync(path.join(repo, 'dist'), { recursive: true })
    fs.writeFileSync(rcFile, 'export FOO="bar"\n', 'utf8')

    const previousCwd = process.cwd()
    process.chdir(repo)

    try {
      const io = createIo()
      await runCli(['setup', 'shell', rcFile], io.io)
      await runCli(['setup', 'shell', rcFile], io.io)

      const rcText = fs.readFileSync(rcFile, 'utf8')
      const distPath = path.resolve(process.cwd(), 'dist')

      expect(rcText).toContain('export FOO="bar"')
      expect(rcText).toContain('# hippo mcp')
      expect(rcText).toContain(`export PATH="${distPath}:$PATH"`)
      expect(rcText.match(/# hippo mcp/g)).toHaveLength(1)
      expect(io.getStdout()).toContain(`source ${rcFile}`)
      expect(io.getStderr()).toBe('')
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('fails shell setup when dist has not been built', async () => {
    const repo = createTempDir()
    const rcFile = path.join(createTempDir(), '.zshrc')
    const previousCwd = process.cwd()
    process.chdir(repo)

    try {
      await expect(runCli(['setup', 'shell', rcFile], createIo().io)).rejects.toThrow(
        `dist directory not found at ${path.join(fs.realpathSync.native(repo), 'dist')}. Run \`pnpm build\` first.`,
      )
    } finally {
      process.chdir(previousCwd)
    }
  })
})
