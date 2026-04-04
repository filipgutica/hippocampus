import fs from 'node:fs'
import path from 'node:path'
import type { CliIO, CliResult } from './shared.js'
import {
  buildMemoryBootstrapText,
  buildSessionStartScript,
  ensureDirectory,
  hippoMcpServerConfig,
  resolveClaudeHome,
  resolveClaudeSessionStartScriptPath,
  resolveClaudeSettingsPath,
  resolveClaudeUserConfigPath,
  resolveCodexConfigPath,
  resolveCodexHome,
  resolveCodexHooksPath,
  resolveCodexSessionStartScriptPath,
  resolveHippoBootstrapDir,
  resolveInstallerStatePath,
} from '../setup/bootstrap.js'

type SetupOptions = {
  dryRun: boolean
}

type ShellSetupOptions = SetupOptions & {
  rcFilePath: string
}

type CommandHook = {
  type: 'command'
  command: string
  statusMessage?: string
}

type SessionStartEntry = {
  matcher?: string
  hooks: CommandHook[]
}

type ClaudeSettings = {
  hooks?: {
    SessionStart?: SessionStartEntry[]
  }
}

type ClaudeMcpServerConfig = {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

type ClaudeUserConfig = {
  mcpServers?: Record<string, ClaudeMcpServerConfig>
}

type CodexHooksConfig = {
  hooks?: {
    SessionStart?: SessionStartEntry[]
  }
}

type InstallerState = {
  claude?: {
    ownsMcpServer?: boolean
  }
}

type CodexMcpServer = {
  command: string
  args: string[]
}

const readTextFile = (filePath: string): string | null => {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(filePath, 'utf8')
}

const writeTextFile = (filePath: string, contents: string): void => {
  ensureDirectory(path.dirname(filePath))
  fs.writeFileSync(filePath, contents, 'utf8')
}

const loadInstallerState = (filePath: string): InstallerState => {
  const raw = readTextFile(filePath)
  if (!raw) {
    return {}
  }

  return JSON.parse(raw) as InstallerState
}

const writeInstallerState = (filePath: string, state: InstallerState): void => {
  writeTextFile(filePath, `${JSON.stringify(state, null, 2)}\n`)
}

const setClaudeMcpOwnership = (state: InstallerState, ownsMcpServer: boolean): InstallerState => {
  if (ownsMcpServer) {
    return {
      ...state,
      claude: {
        ...(state.claude ?? {}),
        ownsMcpServer: true,
      },
    }
  }

  const nextState = { ...state }
  delete nextState.claude
  return nextState
}

const removeManagedCommandHook = (
  existing: SessionStartEntry[] | undefined,
  command: string,
): { entries: SessionStartEntry[]; changed: boolean } => {
  let changed = false
  const nextEntries: SessionStartEntry[] = []

  for (const entry of existing ?? []) {
    const nextHooks = entry.hooks.filter(hook => !(hook.type === 'command' && hook.command === command))

    if (nextHooks.length !== entry.hooks.length) {
      changed = true
    }

    if (nextHooks.length > 0) {
      nextEntries.push({
        ...entry,
        hooks: nextHooks,
      })
    }
  }

  return {
    entries: nextEntries,
    changed,
  }
}

const buildSessionStartEntries = ({
  existing,
  command,
  hook,
  matcher,
}: {
  existing: SessionStartEntry[] | undefined
  command: string
  hook: CommandHook
  matcher?: string
}): SessionStartEntry[] => [
  ...removeManagedCommandHook(existing, command).entries,
  {
    ...(matcher ? { matcher } : {}),
    hooks: [hook],
  },
]

const loadClaudeSettings = (filePath: string): ClaudeSettings => {
  const raw = readTextFile(filePath)
  if (!raw) {
    return {}
  }

  return JSON.parse(raw) as ClaudeSettings
}

const writeClaudeSettings = (filePath: string, settings: ClaudeSettings): void => {
  writeTextFile(filePath, `${JSON.stringify(settings, null, 2)}\n`)
}

const loadClaudeUserConfig = (filePath: string): ClaudeUserConfig => {
  const raw = readTextFile(filePath)
  if (!raw) {
    return {}
  }

  return JSON.parse(raw) as ClaudeUserConfig
}

const writeClaudeUserConfig = (filePath: string, config: ClaudeUserConfig): void => {
  writeTextFile(filePath, `${JSON.stringify(config, null, 2)}\n`)
}

const buildClaudeMcpServer = (config: CodexMcpServer): ClaudeMcpServerConfig => ({
  type: 'stdio',
  command: config.command,
  args: config.args,
  env: {},
})

const isSameClaudeMcpServer = (left: ClaudeMcpServerConfig, right: ClaudeMcpServerConfig): boolean =>
  left.type === right.type &&
  left.command === right.command &&
  JSON.stringify(left.args ?? []) === JSON.stringify(right.args ?? []) &&
  JSON.stringify(left.env ?? {}) === JSON.stringify(right.env ?? {})

const installClaudeMcpServer = ({
  existing,
  installerOwnsMcpServer,
  name,
  config,
}: {
  existing: ClaudeUserConfig
  installerOwnsMcpServer: boolean
  name: string
  config: CodexMcpServer
}): {
  nextConfig: ClaudeUserConfig
  changed: boolean
  ownsMcpServer: boolean
  skippedUnmanaged: boolean
} => {
  const expected = buildClaudeMcpServer(config)
  const current = existing.mcpServers?.[name]

  if (!current) {
    return {
      nextConfig: {
        ...existing,
        mcpServers: {
          ...(existing.mcpServers ?? {}),
          [name]: expected,
        },
      },
      changed: true,
      ownsMcpServer: true,
      skippedUnmanaged: false,
    }
  }

  if (!installerOwnsMcpServer) {
    return {
      nextConfig: existing,
      changed: false,
      ownsMcpServer: false,
      skippedUnmanaged: true,
    }
  }

  if (isSameClaudeMcpServer(current, expected)) {
    return {
      nextConfig: existing,
      changed: false,
      ownsMcpServer: true,
      skippedUnmanaged: false,
    }
  }

  return {
    nextConfig: {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers ?? {}),
        [name]: expected,
      },
    },
    changed: true,
    ownsMcpServer: true,
    skippedUnmanaged: false,
  }
}

const loadCodexHooks = (filePath: string): CodexHooksConfig => {
  const raw = readTextFile(filePath)
  if (!raw) {
    return {}
  }

  return JSON.parse(raw) as CodexHooksConfig
}

const writeCodexHooks = (filePath: string, config: CodexHooksConfig): void => {
  writeTextFile(filePath, `${JSON.stringify(config, null, 2)}\n`)
}

const stripManagedTomlBlock = (existing: string | null): { contents: string | null; changed: boolean } => {
  if (!existing) {
    return {
      contents: null,
      changed: false,
    }
  }

  const lines = existing.split(/\r?\n/)
  const outputLines: string[] = []
  let changed = false

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()

    if (trimmed === '# hippo-mcp:start') {
      changed = true

      while (index < lines.length && lines[index].trim() !== '# hippo-mcp:end') {
        index += 1
      }

      if (index >= lines.length) {
        throw new Error('hippo-mcp:start found without hippo-mcp:end in TOML config')
      }

      continue
    }

    outputLines.push(lines[index])
  }

  const preserved = outputLines.join('\n').trimEnd()
  return {
    contents: preserved.length === 0 ? null : `${preserved}\n`,
    changed,
  }
}

const hasUnmanagedCodexMcpServer = (existing: string | null): boolean => {
  const preserved = stripManagedTomlBlock(existing).contents

  if (!preserved) {
    return false
  }

  return preserved.split(/\r?\n/).some(line => line.trim() === '[mcp_servers.hippo]')
}

const buildCodexMcpBlock = (): string =>
  [
    '# hippo-mcp:start',
    '[mcp_servers.hippo]',
    `command = ${JSON.stringify(hippoMcpServerConfig.command)}`,
    `args = ["${hippoMcpServerConfig.args.join('", "')}"]`,
    '# hippo-mcp:end',
  ].join('\n')

const upsertCodexHooksFeature = (existing: string): string => {
  const lines = existing.split(/\r?\n/)
  let featuresIndex = -1

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === '[features]') {
      featuresIndex = index
      break
    }
  }

  if (featuresIndex === -1) {
    const trimmed = existing.trimEnd()
    return trimmed.length === 0 ? '[features]\ncodex_hooks = true\n' : `${trimmed}\n\n[features]\ncodex_hooks = true\n`
  }

  let sectionEnd = lines.length
  for (let index = featuresIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('[')) {
      sectionEnd = index
      break
    }
  }

  for (let index = featuresIndex + 1; index < sectionEnd; index += 1) {
    if (lines[index].trim().startsWith('codex_hooks')) {
      lines[index] = 'codex_hooks = true'
      return `${lines.join('\n').trimEnd()}\n`
    }
  }

  lines.splice(sectionEnd, 0, 'codex_hooks = true')
  return `${lines.join('\n').trimEnd()}\n`
}

const upsertCodexConfig = (existing: string | null): string => {
  if (hasUnmanagedCodexMcpServer(existing)) {
    return existing ?? ''
  }

  const preserved = stripManagedTomlBlock(existing).contents?.trimEnd() ?? ''
  const block = buildCodexMcpBlock()
  const next = preserved.length === 0 ? block : `${preserved}\n\n${block}`

  return upsertCodexHooksFeature(next)
}

const writeCodexConfig = (filePath: string): void => {
  writeTextFile(filePath, upsertCodexConfig(readTextFile(filePath)))
}

const writeClaudeSessionStartScript = (filePath: string): void => {
  writeTextFile(filePath, `${buildSessionStartScript()}\n`)
}

const writeCodexSessionStartScript = (filePath: string): void => {
  writeTextFile(filePath, `${buildSessionStartScript()}\n`)
}

const buildShellPathBlock = (distPath: string): string => ['# hippo mcp', `export PATH="${distPath}:$PATH"`].join('\n')

const upsertShellPathBlock = (existing: string | null, block: string): string => {
  const pattern = /(?:^|\n)# hippo mcp\nexport PATH="[^"\n]+:\$PATH"\n?/g
  const stripped = (existing ?? '').replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim()

  return stripped.length === 0 ? `${block}\n` : `${stripped}\n\n${block}\n`
}

const describePaths = (label: string, paths: string[]): string =>
  [label, ...paths.map(filePath => `- ${filePath}`)].join('\n')

const runSetup = (target: 'claude' | 'codex', io: CliIO, dryRun: boolean): CliResult => {
  const bootstrapDir = resolveHippoBootstrapDir()
  const installerStatePath = resolveInstallerStatePath()
  const bootstrapText = buildMemoryBootstrapText()
  const filesToCreate: string[] = []
  const notes: string[] = []

  if (target === 'claude') {
    const settingsPath = resolveClaudeSettingsPath()
    const userConfigPath = resolveClaudeUserConfigPath()
    const scriptPath = resolveClaudeSessionStartScriptPath()
    const command = `node ${JSON.stringify(scriptPath)}`
    const currentSettings = loadClaudeSettings(settingsPath)
    const currentUserConfig = loadClaudeUserConfig(userConfigPath)
    const currentInstallerState = loadInstallerState(installerStatePath)
    const nextSettings: ClaudeSettings = {
      ...currentSettings,
      hooks: {
        ...(currentSettings.hooks ?? {}),
        SessionStart: buildSessionStartEntries({
          existing: currentSettings.hooks?.SessionStart,
          command,
          hook: {
            type: 'command',
            command,
          },
        }),
      },
    }
    const mcpResult = installClaudeMcpServer({
      existing: currentUserConfig,
      installerOwnsMcpServer: currentInstallerState.claude?.ownsMcpServer === true,
      name: 'hippo',
      config: hippoMcpServerConfig,
    })
    const nextInstallerState = setClaudeMcpOwnership(currentInstallerState, mcpResult.ownsMcpServer)

    if (mcpResult.skippedUnmanaged) {
      notes.push('skipped: existing user-managed Claude mcpServers.hippo was preserved.')
    }

    filesToCreate.push(scriptPath, settingsPath, userConfigPath, installerStatePath)

    if (!dryRun) {
      ensureDirectory(resolveClaudeHome())
      ensureDirectory(bootstrapDir)
      writeClaudeSessionStartScript(scriptPath)
      writeClaudeSettings(settingsPath, nextSettings)
      if (mcpResult.changed) {
        writeClaudeUserConfig(userConfigPath, mcpResult.nextConfig)
      }
      if (Object.keys(nextInstallerState).length > 0) {
        writeInstallerState(installerStatePath, nextInstallerState)
      }
    }

    io.stdout.write(
      [
        dryRun ? 'dry run: Claude session bootstrap would be installed.' : 'Claude session bootstrap installed.',
        describePaths('files', filesToCreate),
        ...(notes.length > 0 ? ['', ...notes] : []),
        '',
        'bootstrap text:',
        bootstrapText,
      ].join('\n'),
    )

    return { code: 0 }
  }

  const hooksPath = resolveCodexHooksPath()
  const codexConfigPath = resolveCodexConfigPath()
  const scriptPath = resolveCodexSessionStartScriptPath()
  const command = `node ${JSON.stringify(scriptPath)}`
  const currentHooks = loadCodexHooks(hooksPath)
  const currentCodexConfig = readTextFile(codexConfigPath)
  const codexConfigWasUnmanaged = hasUnmanagedCodexMcpServer(currentCodexConfig)
  const nextHooks: CodexHooksConfig = {
    ...currentHooks,
    hooks: {
      ...(currentHooks.hooks ?? {}),
      SessionStart: buildSessionStartEntries({
        existing: currentHooks.hooks?.SessionStart,
        command,
        matcher: 'startup|resume',
        hook: {
          type: 'command',
          command,
          statusMessage: 'Loading Hippocampus memory',
        },
      }),
    },
  }

  filesToCreate.push(scriptPath, hooksPath, codexConfigPath)

  if (!dryRun) {
    ensureDirectory(resolveCodexHome())
    ensureDirectory(bootstrapDir)
    writeCodexSessionStartScript(scriptPath)
    writeCodexHooks(hooksPath, nextHooks)
    writeCodexConfig(codexConfigPath)
  }

  io.stdout.write(
    [
      dryRun ? 'dry run: Codex memory bootstrap would be installed.' : 'Codex memory bootstrap installed.',
      describePaths('files', filesToCreate),
      ...(codexConfigWasUnmanaged ? ['', 'skipped: existing user-managed Codex [mcp_servers.hippo] was preserved.'] : []),
      '',
      'bootstrap text:',
      bootstrapText,
    ].join('\n'),
  )

  return { code: 0 }
}

export const runSetupClaudeCommand = (io: CliIO, options: SetupOptions): CliResult =>
  runSetup('claude', io, options.dryRun)

export const runSetupCodexCommand = (io: CliIO, options: SetupOptions): CliResult =>
  runSetup('codex', io, options.dryRun)

export const runSetupShellCommand = (io: CliIO, options: ShellSetupOptions): CliResult => {
  const rcFilePath = path.resolve(options.rcFilePath)
  const distPath = path.resolve(process.cwd(), 'dist')

  if (!fs.existsSync(distPath) || !fs.statSync(distPath).isDirectory()) {
    throw new Error(`dist directory not found at ${distPath}. Run \`pnpm build\` first.`)
  }

  const block = buildShellPathBlock(distPath)
  const updated = upsertShellPathBlock(readTextFile(rcFilePath), block)

  if (!options.dryRun) {
    writeTextFile(rcFilePath, updated)
  }

  io.stdout.write(
    [
      options.dryRun ? 'dry run: shell PATH bootstrap would be installed.' : 'shell PATH bootstrap installed.',
      describePaths('files', [rcFilePath]),
      '',
      'appended block:',
      block,
      '',
      `next step: run \`source ${rcFilePath}\` or start a new shell session.`,
    ].join('\n'),
  )

  return { code: 0 }
}
