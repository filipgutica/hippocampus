import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type SetupTarget = 'claude' | 'codex'

const resolveHomeDir = (): string => process.env.HOME ?? os.homedir()

export const resolveHippoHome = (): string => process.env.HIPPOCAMPUS_HOME ?? path.join(resolveHomeDir(), '.hippocampus')

export const resolveClaudeHome = (): string => path.join(resolveHomeDir(), '.claude')

export const resolveCodexHome = (): string => path.join(resolveHomeDir(), '.codex')

export const resolveHippoBootstrapDir = (): string => path.join(resolveHippoHome(), 'bootstrap')

export const resolveInstallerStatePath = (): string => path.join(resolveHippoHome(), 'installer-state.json')

export const resolveClaudeSettingsPath = (): string => path.join(resolveClaudeHome(), 'settings.json')

export const resolveClaudeUserConfigPath = (): string => path.join(resolveHomeDir(), '.claude.json')

export const resolveCodexHooksPath = (): string => path.join(resolveCodexHome(), 'hooks.json')

export const resolveCodexConfigPath = (): string => path.join(resolveCodexHome(), 'config.toml')

export const resolveClaudeSessionStartScriptPath = (): string => path.join(resolveHippoBootstrapDir(), 'claude-session-start.mjs')

export const resolveCodexSessionStartScriptPath = (): string => path.join(resolveHippoBootstrapDir(), 'codex-session-start.mjs')

export const hippoMcpServerConfig = {
  command: 'npx',
  args: ['-y', 'hippocampus', 'mcp', 'serve'],
}

export const buildMemoryBootstrapText = (): string =>
  [
    '# Hippocampus Memory Bootstrap',
    '',
    'Use Hippocampus proactively at the start of every new thread.',
    '',
    '## Startup sequence',
    '1. Call `memory-get-policy` first.',
    '2. If the current work is in a repository, call `project ensure` first.',
    '3. Call `memory-list` for project scope using the ensured project scope id.',
    '4. Call `memory-list` for user scope using the configured user scope id you actually want to query.',
    '5. If the topic is clear and durable, call `memory-search` before making assumptions.',
    '',
    '## Writing',
    '- Save durable observations with `memory-apply-observation`.',
    '- Use `memory-contradict` when a memory is stale or wrong.',
    '- Prefer one clear subject per memory.',
    '- Do not save transient task state, one-off debugging breadcrumbs, branch names, or speculative guesses.',
    '',
    '## Scope',
    '- Treat project scope like a project-local `AGENTS.md`.',
    '- Treat user scope like a global `AGENTS.md`.',
    '- Use the narrowest scope that will remain useful later.',
    '',
    'If Hippocampus is unavailable, continue without inventing memory state and note the limitation if it matters.',
  ].join('\n')

export const buildSessionStartScript = (): string => {
  const bootstrapText = buildMemoryBootstrapText()

  return [
    '#!/usr/bin/env node',
    '',
    "import { spawnSync } from 'node:child_process'",
    "import fs from 'node:fs'",
    "import path from 'node:path'",
    '',
    `const bootstrapText = ${JSON.stringify(bootstrapText)}`,
    '',
    "const resolveHippoCommand = () => {",
    "  const result = spawnSync('sh', ['-lc', 'command -v hippo || command -v hippocampus || true'], { encoding: 'utf8' })",
    '  const command = result.stdout.trim()',
    '  return command.length > 0 ? command : null',
    '}',
    '',
    "const runHippo = (command, args) => {",
    "  const result = spawnSync(command, args, { encoding: 'utf8' })",
    '  if (result.status !== 0) {',
    '    return null',
    '  }',
    '',
    '  const output = result.stdout.trim()',
    '  return output.length > 0 ? output : null',
    '}',
    '',
    "const findRepoRoot = () => {",
    "  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })",
    '  if (result.status !== 0) {',
    '    return null',
    '  }',
    '',
    '  const root = result.stdout.trim()',
    '  return root.length > 0 ? root : null',
    '}',
    '',
    'const readCurrentUserId = () => {',
    "  const configPath = path.join(process.env.HIPPOCAMPUS_HOME ?? path.join(process.env.HOME ?? '', '.hippocampus'), 'config.json')",
    '  try {',
    "    const raw = fs.readFileSync(configPath, 'utf8')",
    '    const parsed = JSON.parse(raw)',
    "    return typeof parsed.currentUserId === 'string' && parsed.currentUserId.length > 0 ? parsed.currentUserId : null",
    '  } catch {',
    '    return null',
    '  }',
    '}',
    '',
    'const sections = []',
    'sections.push(bootstrapText)',
    '',
    'const hippoCommand = resolveHippoCommand()',
    'if (hippoCommand) {',
    "  const policy = runHippo(hippoCommand, ['get-policy'])",
    '  if (policy) {',
    "    sections.push(['## Hippocampus policy', policy].join('\\n'))",
    '  }',
    '',
    '  const repoRoot = findRepoRoot()',
    '  let projectScopeId = null',
    '  if (repoRoot) {',
    "    const ensuredProject = runHippo(hippoCommand, ['project', 'ensure', '--scope-id', repoRoot, '--json'])",
    '    if (ensuredProject) {',
    '      try {',
    '        const parsed = JSON.parse(ensuredProject)',
    "        projectScopeId = typeof parsed?.project?.scope?.id === 'string' ? parsed.project.scope.id : null",
    '      } catch {',
    '        projectScopeId = null',
    '      }',
    '    }',
    '  }',
    '',
    '  if (projectScopeId) {',
    "    const projectMemories = runHippo(hippoCommand, ['memories', 'list', '--scope-type', 'project', '--scope-id', projectScopeId, '--limit', '5'])",
    '    if (projectMemories) {',
    "      sections.push(['## Project memories', `scope: ${projectScopeId}`, projectMemories].join('\\n'))",
    '    }',
    '  }',
    '',
    '  const userId = readCurrentUserId()',
    '  if (userId) {',
    "    const userMemories = runHippo(hippoCommand, ['memories', 'list', '--scope-type', 'user', '--scope-id', userId, '--limit', '5'])",
    '    if (userMemories) {',
    "      sections.push(['## Local owner memories', `owner: ${userId}`, userMemories].join('\\n'))",
    '    }',
    '  }',
    '}',
    '',
    "const additionalContext = sections.filter(Boolean).join('\\n\\n').trim()",
    'const payload = {',
    '  hookSpecificOutput: {',
    "    hookEventName: 'SessionStart',",
    '    additionalContext,',
    '  },',
    '}',
    '',
    "process.stdout.write(`${JSON.stringify(payload)}\\n`)",
    '',
  ].join('\n')
}

export const ensureDirectory = (directoryPath: string): void => {
  fs.mkdirSync(directoryPath, { recursive: true })
}
