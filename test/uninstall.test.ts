import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const promptMocks = vi.hoisted(() => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => promptMocks)

import { runCli } from '../src/cli/cli.js'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-uninstall-test-'))
  tempDirs.push(dir)
  return dir
}

const createIo = () => {
  const stdin = new PassThrough()
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
    io: { stdin, stdout, stderr },
    getStdout: () => stdoutText,
    getStderr: () => stderrText,
    setInteractive: (interactive: boolean) => {
      stdin.isTTY = interactive
      stdout.isTTY = interactive
    },
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
  vi.clearAllMocks()

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('uninstall command', () => {
  it('removes only the installer-owned Claude hook and MCP server', async () => {
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
                  hooks: [{ type: 'command', command: 'echo existing' }],
                },
              ],
            },
          },
          null,
          2,
        ),
        'utf8',
      )

      await runCli(['setup', 'claude'], createIo().io)

      const io = createIo()
      await runCli(['uninstall', 'claude'], io.io)

      const settingsPath = path.join(home, '.claude', 'settings.json')
      const configPath = path.join(home, '.claude.json')
      const installerStatePath = path.join(home, '.hippocampus', 'installer-state.json')
      const scriptPath = path.join(home, '.hippocampus', 'bootstrap', 'claude-session-start.mjs')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
        hooks?: {
          SessionStart?: Array<{
            hooks: Array<{
              command: string
            }>
          }>
        }
      }
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        mcpServers?: Record<string, unknown>
      }

      expect(settings.hooks?.SessionStart).toHaveLength(1)
      expect(settings.hooks?.SessionStart?.[0]?.hooks[0]?.command).toBe('echo existing')
      expect(config.mcpServers?.hippo).toBeUndefined()
      expect(fs.existsSync(scriptPath)).toBe(false)
      expect(fs.existsSync(installerStatePath)).toBe(false)
      expect(io.getStdout()).toContain('Hippocampus integrations removed.')
      expect(io.getStderr()).toBe('')
    })
  })

  it('preserves user-managed Claude MCP config on uninstall', async () => {
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
                  hooks: [{ type: 'command', command: 'echo existing' }],
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
              },
            },
          },
          null,
          2,
        ),
        'utf8',
      )

      await runCli(['setup', 'claude'], createIo().io)
      await runCli(['uninstall', 'claude'], createIo().io)

      const config = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
        mcpServers?: { hippo?: { command?: string } }
      }

      expect(config.mcpServers?.hippo?.command).toBe('custom-hippo')
    })
  })

  it('removes only the installer-owned Codex hook and managed MCP block while preserving siblings', async () => {
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

      await runCli(['setup', 'codex'], createIo().io)

      const io = createIo()
      await runCli(['uninstall', 'codex'], io.io)

      const hooksPath = path.join(home, '.codex', 'hooks.json')
      const configPath = path.join(home, '.codex', 'config.toml')
      const scriptPath = path.join(home, '.hippocampus', 'bootstrap', 'codex-session-start.mjs')
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8')) as {
        hooks?: {
          SessionStart?: Array<{
            hooks: Array<{
              command: string
            }>
          }>
        }
      }
      const configText = fs.readFileSync(configPath, 'utf8')

      expect(hooks.hooks?.SessionStart).toHaveLength(1)
      expect(hooks.hooks?.SessionStart?.[0]?.hooks).toHaveLength(2)
      expect(configText).not.toContain('# hippo-mcp:start')
      expect(configText).not.toContain('[mcp_servers.hippo]')
      expect(configText).toContain('[features]')
      expect(configText).toContain('codex_hooks = true')
      expect(fs.existsSync(scriptPath)).toBe(false)
      expect(io.getStdout()).toContain('Hippocampus integrations removed.')
      expect(io.getStderr()).toBe('')
    })
  })

  it('preserves unmanaged Codex MCP config when uninstall removes only the managed block', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      const codexDir = path.join(home, '.codex')
      fs.mkdirSync(codexDir, { recursive: true })
      fs.writeFileSync(
        path.join(codexDir, 'config.toml'),
        [
          '[mcp_servers.other]',
          'command = "other"',
          '',
          '[features]',
          'codex_hooks = true',
          '',
          '# hippo-mcp:start',
          '[mcp_servers.hippo]',
          'command = "npx"',
          'args = ["-y", "hippocampus", "mcp", "serve"]',
          '# hippo-mcp:end',
        ].join('\n'),
        'utf8',
      )

      await runCli(['uninstall', 'codex'], createIo().io)

      const configText = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8')
      expect(configText).toContain('[mcp_servers.other]')
      expect(configText).not.toContain('# hippo-mcp:start')
    })
  })

  it('removes the shell PATH bootstrap block and preserves surrounding content', async () => {
    const home = createTempDir()
    const repo = createTempDir()
    const rcFile = path.join(home, '.zshrc')

    fs.mkdirSync(path.join(repo, 'dist'), { recursive: true })
    fs.writeFileSync(rcFile, 'export FOO="bar"\n', 'utf8')

    const previousCwd = process.cwd()
    process.chdir(repo)

    try {
      await withEnv('HOME', home, async () => {
        await runCli(['setup', 'shell', rcFile], createIo().io)

        const io = createIo()
        await runCli(['uninstall', 'shell', rcFile], io.io)

        const rcText = fs.readFileSync(rcFile, 'utf8')
        expect(rcText).toBe('export FOO="bar"\n')
        expect(io.getStdout()).toContain('shell PATH bootstrap removed.')
        expect(io.getStdout()).toContain(`source ${rcFile}`)
        expect(io.getStderr()).toBe('')
      })
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('tracks shell rc files during setup and removes them during mcp/hooks-only interactive uninstall', async () => {
    const home = createTempDir()
    const repo = createTempDir()
    const rcFile = path.join(home, '.zshrc')

    fs.mkdirSync(path.join(repo, 'dist'), { recursive: true })
    fs.writeFileSync(rcFile, 'export FOO="bar"\n', 'utf8')

    const previousCwd = process.cwd()
    process.chdir(repo)

    try {
      await withEnv('HOME', home, async () => {
        await runCli(['setup', 'shell', rcFile], createIo().io)

        promptMocks.select.mockResolvedValue('mcp-hooks-only')
        promptMocks.checkbox.mockResolvedValue(['shell'])
        promptMocks.confirm.mockResolvedValue(true)

        const io = createIo()
        io.setInteractive(true)
        await runCli(['uninstall'], io.io)

        expect(fs.readFileSync(rcFile, 'utf8')).toBe('export FOO="bar"\n')
        expect(io.getStdout()).toContain('Hippocampus integrations removed.')
      })
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('supports full-wipe uninstall and removes the Hippocampus home directory', async () => {
    const home = createTempDir()
    const appHome = path.join(home, '.hippocampus-dev')

    await withEnv('HOME', home, async () => {
      await withEnv('HIPPOCAMPUS_HOME', appHome, async () => {
        await runCli(['init'], createIo().io)
        await runCli(['setup', 'claude'], createIo().io)

        const io = createIo()
        await runCli(['uninstall', '--mode', 'full-wipe', '--yes'], io.io)

        expect(fs.existsSync(appHome)).toBe(false)
        expect(io.getStdout()).toContain('Hippocampus full wipe removed.')
      })
    })
  })

  it('is idempotent when uninstalling Codex twice', async () => {
    const home = createTempDir()

    await withEnv('HOME', home, async () => {
      await runCli(['setup', 'codex'], createIo().io)
      await runCli(['uninstall', 'codex'], createIo().io)

      const hooksPath = path.join(home, '.codex', 'hooks.json')
      const configPath = path.join(home, '.codex', 'config.toml')
      const hooksAfterFirst = fs.readFileSync(hooksPath, 'utf8')
      const configAfterFirst = fs.readFileSync(configPath, 'utf8')

      const io = createIo()
      await runCli(['uninstall', 'codex'], io.io)

      expect(fs.readFileSync(hooksPath, 'utf8')).toBe(hooksAfterFirst)
      expect(fs.readFileSync(configPath, 'utf8')).toBe(configAfterFirst)
      expect(io.getStdout()).toContain('Hippocampus integrations removed.')
      expect(io.getStderr()).toBe('')
    })
  })
})
