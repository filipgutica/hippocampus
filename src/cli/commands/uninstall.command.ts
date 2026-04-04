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
  resolveHippoHome,
  resolveInstallerStatePath,
} from '../setup/bootstrap.js'

export type UninstallMode = 'mcp-hooks-only' | 'full-wipe'
export type UninstallTarget = 'claude' | 'codex' | 'shell'

type UninstallOptions = {
  dryRun: boolean
}

type ShellUninstallOptions = UninstallOptions & {
  rcFilePath: string
}

type ManagedUninstallOptions = UninstallOptions & {
  mode: UninstallMode
  targets: UninstallTarget[]
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
  shell?: {
    rcFilePaths: string[]
  }
}

type OperationResult = {
  changed: boolean
  notes: string[]
  paths: string[]
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

const persistInstallerState = ({
  filePath,
  current,
  next,
}: {
  filePath: string
  current: InstallerState
  next: InstallerState
}): void => {
  if (JSON.stringify(current) === JSON.stringify(next)) {
    return
  }

  if (Object.keys(next).length === 0) {
    deleteIfExists(filePath)
    return
  }

  writeInstallerState(filePath, next)
}

const clearClaudeMcpOwnership = (state: InstallerState): InstallerState => {
  const nextState = { ...state }
  delete nextState.claude
  return nextState
}

const untrackShellRcFile = (state: InstallerState, rcFilePath: string): InstallerState => {
  const nextPaths = (state.shell?.rcFilePaths ?? []).filter(tracked => tracked !== rcFilePath)
  if (nextPaths.length === 0) {
    const nextState = { ...state }
    delete nextState.shell
    return nextState
  }

  return {
    ...state,
    shell: {
      rcFilePaths: nextPaths,
    },
  }
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
    fs.rmSync(filePath, { force: true, recursive: true })
  }
}

const removeClaudeIntegration = ({
  dryRun,
  installerState,
  installerStatePath,
}: {
  dryRun: boolean
  installerState: InstallerState
  installerStatePath: string
}): { result: OperationResult; installerState: InstallerState } => {
  const settingsPath = resolveClaudeSettingsPath()
  const userConfigPath = resolveClaudeUserConfigPath()
  const scriptPath = resolveClaudeSessionStartScriptPath()
  const command = `node ${JSON.stringify(scriptPath)}`
  const currentSettings = loadClaudeSettings(settingsPath)
  const currentUserConfig = loadClaudeUserConfig(userConfigPath)
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
  let nextInstallerState = installerState
  const notes: string[] = []

  if (installerState.claude?.ownsMcpServer === true && currentUserConfig.mcpServers?.hippo) {
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
    nextInstallerState = clearClaudeMcpOwnership(installerState)
  } else if (installerState.claude?.ownsMcpServer === true) {
    nextInstallerState = clearClaudeMcpOwnership(installerState)
  } else if (currentUserConfig.mcpServers?.hippo) {
    notes.push('preserved: existing user-managed Claude mcpServers.hippo was left unchanged.')
  }

  if (!dryRun) {
    if (hookResult.changed) {
      writeClaudeSettings(settingsPath, nextSettings)
    }

    if (userConfigChanged) {
      writeClaudeUserConfig(userConfigPath, nextUserConfig)
    }

    persistInstallerState({
      filePath: installerStatePath,
      current: installerState,
      next: nextInstallerState,
    })
    deleteIfExists(scriptPath)
  }

  return {
    result: {
      changed: hookResult.changed || userConfigChanged || installerState !== nextInstallerState || fs.existsSync(scriptPath),
      notes,
      paths: [settingsPath, userConfigPath, scriptPath],
    },
    installerState: nextInstallerState,
  }
}

const removeCodexIntegration = ({ dryRun }: { dryRun: boolean }): OperationResult => {
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
  const notes: string[] = []
  const currentConfig = readTextFile(codexConfigPath)
  if (currentConfig?.includes('[mcp_servers.hippo]') && !strippedConfig.changed) {
    notes.push('preserved: existing user-managed Codex [mcp_servers.hippo] was left unchanged.')
  }

  if (!dryRun) {
    if (hookResult.changed) {
      writeCodexHooks(hooksPath, nextHooks)
    }

    if (strippedConfig.changed) {
      writeTextFile(codexConfigPath, strippedConfig.contents ?? '')
    }

    deleteIfExists(scriptPath)
  }

  return {
    changed: hookResult.changed || strippedConfig.changed || fs.existsSync(scriptPath),
    notes,
    paths: [hooksPath, codexConfigPath, scriptPath],
  }
}

const removeShellInstall = ({
  dryRun,
  installerState,
  installerStatePath,
  rcFilePath,
}: {
  dryRun: boolean
  installerState: InstallerState
  installerStatePath: string
  rcFilePath: string
}): { result: OperationResult; installerState: InstallerState } => {
  const resolvedRcFilePath = path.resolve(rcFilePath)
  const current = readTextFile(resolvedRcFilePath)
  const [next, changed] = stripShellPathBlock(current)
  const nextInstallerState = untrackShellRcFile(installerState, resolvedRcFilePath)

  if (!dryRun && changed && next !== null) {
    writeTextFile(resolvedRcFilePath, next)
  }

  if (!dryRun) {
    persistInstallerState({
      filePath: installerStatePath,
      current: installerState,
      next: nextInstallerState,
    })
  }

  return {
    result: {
      changed: changed || JSON.stringify(installerState) !== JSON.stringify(nextInstallerState),
      notes: [],
      paths: [resolvedRcFilePath],
    },
    installerState: nextInstallerState,
  }
}

const removeHippoHome = ({ dryRun }: { dryRun: boolean }): OperationResult => {
  const hippoHome = resolveHippoHome()
  const existed = fs.existsSync(hippoHome)

  if (!dryRun) {
    deleteIfExists(hippoHome)
  }

  return {
    changed: existed,
    notes: [],
    paths: [hippoHome],
  }
}

const summarizeOperation = ({
  label,
  results,
}: {
  label: string
  results: OperationResult[]
}): string => {
  const paths = [...new Set(results.flatMap(result => result.paths))]
  const notes = results.flatMap(result => result.notes)

  return [label, describePaths('files', paths), ...(notes.length > 0 ? ['', ...notes] : [])].join('\n')
}

export const listTrackedShellRcFiles = (): string[] => loadInstallerState(resolveInstallerStatePath()).shell?.rcFilePaths ?? []

export const runManagedUninstallCommand = (io: CliIO, options: ManagedUninstallOptions): CliResult => {
  const installerStatePath = resolveInstallerStatePath()
  let installerState = loadInstallerState(installerStatePath)
  const results: OperationResult[] = []

  if (options.targets.includes('claude')) {
    const claudeResult = removeClaudeIntegration({
      dryRun: options.dryRun,
      installerState,
      installerStatePath,
    })
    installerState = claudeResult.installerState
    results.push(claudeResult.result)
  }

  if (options.targets.includes('codex')) {
    results.push(removeCodexIntegration({ dryRun: options.dryRun }))
  }

  if (options.targets.includes('shell')) {
    for (const rcFilePath of installerState.shell?.rcFilePaths ?? []) {
      const shellResult = removeShellInstall({
        dryRun: options.dryRun,
        installerState,
        installerStatePath,
        rcFilePath,
      })
      installerState = shellResult.installerState
      results.push(shellResult.result)
    }
  }

  if (options.mode === 'full-wipe') {
    results.push(removeHippoHome({ dryRun: options.dryRun }))
  }

  io.stdout.write(
    `${summarizeOperation({
      label:
        options.mode === 'full-wipe'
          ? options.dryRun
            ? 'dry run: Hippocampus full wipe would be removed.'
            : 'Hippocampus full wipe removed.'
          : options.dryRun
            ? 'dry run: Hippocampus integrations would be removed.'
            : 'Hippocampus integrations removed.',
      results,
    })}\n`,
  )

  return { code: 0 }
}

const runUninstallClaude = (io: CliIO, options: UninstallOptions): CliResult =>
  runManagedUninstallCommand(io, {
    dryRun: options.dryRun,
    mode: 'mcp-hooks-only',
    targets: ['claude'],
  })

const runUninstallCodex = (io: CliIO, options: UninstallOptions): CliResult =>
  runManagedUninstallCommand(io, {
    dryRun: options.dryRun,
    mode: 'mcp-hooks-only',
    targets: ['codex'],
  })

const runUninstallShell = (io: CliIO, options: ShellUninstallOptions): CliResult => {
  const installerStatePath = resolveInstallerStatePath()
  const installerState = loadInstallerState(installerStatePath)
  const { result } = removeShellInstall({
    dryRun: options.dryRun,
    installerState,
    installerStatePath,
    rcFilePath: options.rcFilePath,
  })

  io.stdout.write(
    [
      options.dryRun ? 'dry run: shell PATH bootstrap would be removed.' : 'shell PATH bootstrap removed.',
      describePaths('files', result.paths),
      '',
      `next step: run \`source ${path.resolve(options.rcFilePath)}\` or start a new shell session.`,
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
