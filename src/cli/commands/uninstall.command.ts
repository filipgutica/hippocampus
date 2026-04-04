import fs from 'node:fs'
import path from 'node:path'
import type { CliIO, CliResult } from './shared.js'
import {
  ensureDirectory,
  resolveClaudeSessionStartScriptPath,
  resolveClaudeSettingsPath,
  resolveClaudeUserConfigPath,
  resolveCodexConfigPath,
  resolveCodexHooksPath,
  resolveCodexSessionStartScriptPath,
  resolveInstallerStatePath,
} from '../setup/bootstrap.js'

type UninstallOptions = {
  dryRun: boolean
}

type ShellUninstallOptions = UninstallOptions & {
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

type ClaudeUserConfig = {
  mcpServers?: Record<
    string,
    {
      type?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
    }
  >
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

const clearClaudeMcpOwnership = (state: InstallerState): InstallerState => {
  const nextState = { ...state }
  delete nextState.claude
  return nextState
}

const describePaths = (label: string, paths: string[]): string =>
  [label, ...paths.map(filePath => `- ${filePath}`)].join('\n')

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

const stripShellPathBlock = (existing: string | null): [string | null, boolean] => {
  if (!existing) {
    return [null, false]
  }

  const pattern = /(?:^|\n)# hippo mcp\nexport PATH="[^"\n]+:\$PATH"\n?/g
  if (existing.match(pattern) === null) {
    return [existing, false]
  }

  const stripped = existing.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n')
  const normalized = stripped.replace(/^\n+/, '').replace(/\n+$/, '\n')

  return [normalized, true]
}

const deleteIfExists = (filePath: string): void => {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true })
  }
}

const runUninstallClaude = (io: CliIO, options: UninstallOptions): CliResult => {
  const settingsPath = resolveClaudeSettingsPath()
  const userConfigPath = resolveClaudeUserConfigPath()
  const scriptPath = resolveClaudeSessionStartScriptPath()
  const installerStatePath = resolveInstallerStatePath()
  const command = `node ${JSON.stringify(scriptPath)}`
  const currentSettings = loadClaudeSettings(settingsPath)
  const currentUserConfig = loadClaudeUserConfig(userConfigPath)
  const currentInstallerState = loadInstallerState(installerStatePath)
  const hookResult = removeManagedCommandHook(currentSettings.hooks?.SessionStart, command)
  const nextSettings: ClaudeSettings = { ...currentSettings }

  if (hookResult.changed) {
    const remainingHookSections = Object.fromEntries(
      Object.entries(currentSettings.hooks ?? {}).filter(([key]) => key !== 'SessionStart'),
    ) as NonNullable<ClaudeSettings['hooks']>

    if (hookResult.entries.length > 0 || Object.keys(remainingHookSections).length > 0) {
      nextSettings.hooks = {
        ...remainingHookSections,
        ...(hookResult.entries.length > 0 ? { SessionStart: hookResult.entries } : {}),
      }
    } else {
      delete nextSettings.hooks
    }
  }

  let nextUserConfig = currentUserConfig
  let userConfigChanged = false
  let nextInstallerState = currentInstallerState

  if (currentInstallerState.claude?.ownsMcpServer === true && currentUserConfig.mcpServers?.hippo) {
    const nextMcpServers = { ...(currentUserConfig.mcpServers ?? {}) }
    delete nextMcpServers.hippo
    nextUserConfig =
      Object.keys(nextMcpServers).length > 0
        ? {
            ...currentUserConfig,
            mcpServers: nextMcpServers,
          }
        : {}
    userConfigChanged = true
    nextInstallerState = clearClaudeMcpOwnership(currentInstallerState)
  } else if (currentInstallerState.claude?.ownsMcpServer === true) {
    nextInstallerState = clearClaudeMcpOwnership(currentInstallerState)
  }

  if (!options.dryRun) {
    if (hookResult.changed) {
      writeClaudeSettings(settingsPath, nextSettings)
    }

    if (userConfigChanged) {
      writeClaudeUserConfig(userConfigPath, nextUserConfig)
    }

    if (JSON.stringify(nextInstallerState) !== JSON.stringify(currentInstallerState)) {
      if (Object.keys(nextInstallerState).length === 0) {
        deleteIfExists(installerStatePath)
      } else {
        writeInstallerState(installerStatePath, nextInstallerState)
      }
    }

    deleteIfExists(scriptPath)
  }

  io.stdout.write(
    [
      options.dryRun ? 'dry run: Claude session bootstrap would be removed.' : 'Claude session bootstrap removed.',
      describePaths('files', [settingsPath, userConfigPath, scriptPath, installerStatePath]),
    ].join('\n'),
  )

  return { code: 0 }
}

const runUninstallCodex = (io: CliIO, options: UninstallOptions): CliResult => {
  const hooksPath = resolveCodexHooksPath()
  const codexConfigPath = resolveCodexConfigPath()
  const scriptPath = resolveCodexSessionStartScriptPath()
  const command = `node ${JSON.stringify(scriptPath)}`
  const currentHooks = loadCodexHooks(hooksPath)
  const hookResult = removeManagedCommandHook(currentHooks.hooks?.SessionStart, command)
  const nextHooks: CodexHooksConfig = { ...currentHooks }

  if (hookResult.changed) {
    const remainingHookSections = Object.fromEntries(
      Object.entries(currentHooks.hooks ?? {}).filter(([key]) => key !== 'SessionStart'),
    ) as NonNullable<CodexHooksConfig['hooks']>

    if (hookResult.entries.length > 0 || Object.keys(remainingHookSections).length > 0) {
      nextHooks.hooks = {
        ...remainingHookSections,
        ...(hookResult.entries.length > 0 ? { SessionStart: hookResult.entries } : {}),
      }
    } else {
      delete nextHooks.hooks
    }
  }
  const strippedConfig = stripManagedTomlBlock(readTextFile(codexConfigPath))

  if (!options.dryRun) {
    if (hookResult.changed) {
      writeCodexHooks(hooksPath, nextHooks)
    }

    if (strippedConfig.changed) {
      writeTextFile(codexConfigPath, strippedConfig.contents ?? '')
    }

    deleteIfExists(scriptPath)
  }

  io.stdout.write(
    [
      options.dryRun ? 'dry run: Codex session bootstrap would be removed.' : 'Codex session bootstrap removed.',
      describePaths('files', [hooksPath, codexConfigPath, scriptPath]),
    ].join('\n'),
  )

  return { code: 0 }
}

const runUninstallShell = (io: CliIO, options: ShellUninstallOptions): CliResult => {
  const rcFilePath = path.resolve(options.rcFilePath)
  const current = readTextFile(rcFilePath)
  const [next, changed] = stripShellPathBlock(current)

  if (!options.dryRun && changed && next !== null) {
    writeTextFile(rcFilePath, next)
  }

  io.stdout.write(
    [
      options.dryRun ? 'dry run: shell PATH bootstrap would be removed.' : 'shell PATH bootstrap removed.',
      describePaths('files', [rcFilePath]),
      '',
      `next step: run \`source ${rcFilePath}\` or start a new shell session.`,
    ].join('\n'),
  )

  return { code: 0 }
}

export const runUninstallClaudeCommand = (io: CliIO, options: UninstallOptions): CliResult =>
  runUninstallClaude(io, options)

export const runUninstallCodexCommand = (io: CliIO, options: UninstallOptions): CliResult =>
  runUninstallCodex(io, options)

export const runUninstallShellCommand = (io: CliIO, options: ShellUninstallOptions): CliResult =>
  runUninstallShell(io, options)
