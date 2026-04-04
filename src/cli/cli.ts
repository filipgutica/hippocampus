import yargs from 'yargs'
import { buildApp, type RuntimeApp } from '../app/build-app.js'
import type { ScopeRef, ScopeType } from '../common/types/scope-ref.js'
import type { ApplyObservationInput } from '../memory/dto/apply-observation.dto.js'
import type { SearchMatchMode } from '../memory/dto/search-memories.dto.js'
import { MEMORY_ORIGINS, MEMORY_TYPES } from '../memory/memory.types.js'
import type { MemoryOrigin, MemoryType } from '../memory/memory.types.js'
import { resolveRepoScopeId } from '../repos/repo-scope.js'
import { runApplyCommand } from './commands/apply.command.js'
import { runGetPolicyCommand } from './commands/get-policy.command.js'
import { runInitCommand } from './commands/init.command.js'
import { runMcpServeCommand } from './commands/mcp-serve.command.js'
import { runMemoriesArchiveStaleCommand } from './commands/memories-archive-stale.command.js'
import { runMemoriesMaintainCommand } from './commands/memories-maintain.command.js'
import { runMemoriesDeleteCommand } from './commands/memories-delete.command.js'
import { runMemoriesHistoryCommand } from './commands/memories-history.command.js'
import { runMemoriesInspectCommand } from './commands/memories-inspect.command.js'
import { runMemoriesListCommand } from './commands/memories-list.command.js'
import { runSearchCommand } from './commands/search.command.js'
import { runSetupClaudeCommand, runSetupCodexCommand, runSetupShellCommand } from './commands/setup.command.js'
import {
  listTrackedShellRcFiles,
  runManagedUninstallCommand,
  runUninstallClaudeCommand,
  runUninstallCodexCommand,
  type UninstallMode,
  type UninstallTarget,
  runUninstallShellCommand,
} from './commands/uninstall.command.js'
import { readJsonInput, resolveObservationSource, writeOutput, type CliIO, type CliResult } from './commands/shared.js'
import { isInteractiveIo, promptCheckbox, promptConfirm, promptInput, promptSelect } from './interactive.js'

type JsonOption = {
  json?: boolean
}

type ScopeArgs = {
  scopeType?: ScopeType
  scopeId?: string
}

type ApplyArgs = ScopeArgs &
  JsonOption & {
    type?: MemoryType
    subject?: string
    statement?: string
    origin?: MemoryOrigin
    details?: string
    input?: string
    inputFile?: string
  }

type SearchArgs = ScopeArgs &
  JsonOption & {
    type?: MemoryType
    subject?: string
    limit?: number
    matchMode?: SearchMatchMode
  }

type UninstallArgs = {
  target?: UninstallTarget
  rcFile?: string
  dryRun?: boolean
  yes?: boolean
  mode?: UninstallMode
}

// eslint-disable-next-line no-unused-vars
type RuntimeAppHandler = (app: RuntimeApp) => Promise<CliResult>

const buildRuntimeApp = async (): Promise<RuntimeApp> => {
  const app = await buildApp({ mode: 'runtime', allowLazyInit: false })
  if (app.mode !== 'runtime') {
    throw new Error('Expected runtime app container.')
  }

  return app
}

const resolveScope = ({ scopeType, scopeId }: ScopeArgs): ScopeRef => {
  const type = scopeType ?? 'repo'
  const id = type === 'repo' ? scopeId ?? resolveRepoScopeId(process.cwd()) : scopeId

  if (!id) {
    throw new Error(`Missing --scope-id for scope type ${type}.`)
  }

  return {
    type,
    id,
  }
}

const loadApplyInput = (args: ApplyArgs, argv: string[]): ApplyObservationInput => {
  const parsedInput = readJsonInput([
    ...argv,
    ...(args.input ? ['--input', args.input] : []),
    ...(args.inputFile ? ['--input-file', args.inputFile] : []),
  ]) as Partial<ApplyObservationInput>

  return {
    scope: parsedInput.scope ?? resolveScope(args),
    type: parsedInput.type ?? args.type ?? ('' as MemoryType),
    subject: parsedInput.subject ?? args.subject ?? '',
    statement: parsedInput.statement ?? args.statement ?? '',
    origin: parsedInput.origin ?? args.origin ?? ('' as MemoryOrigin),
    details: parsedInput.details ?? args.details ?? null,
    source: resolveObservationSource(parsedInput) ?? { channel: 'cli' },
  }
}

const confirmDestructiveAction = async ({
  io,
  enabled,
  message,
}: {
  io: CliIO
  enabled: boolean
  message: string
}): Promise<void> => {
  if (!enabled) {
    return
  }

  const confirmed = await promptConfirm({
    io,
    message,
    defaultValue: false,
  })

  if (!confirmed) {
    throw new Error('Operation cancelled.')
  }
}

const resolveInteractiveUninstall = async ({
  args,
  io,
}: {
  args: UninstallArgs
  io: CliIO
}): Promise<{ mode: UninstallMode; targets: UninstallTarget[] }> => {
  const trackedShellRcFiles = listTrackedShellRcFiles()
  const mode =
    args.mode ??
    (await promptSelect<UninstallMode>({
      io,
      message: 'What should uninstall remove?',
      choices: [
        {
          value: 'full-wipe',
          name: 'full-wipe',
          description: 'Remove all installer-managed integrations and the Hippocampus home directory.',
        },
        {
          value: 'mcp-hooks-only',
          name: 'mcp/hooks only',
          description: 'Remove installer-managed client hooks, MCP registrations, and tracked shell PATH blocks.',
        },
      ],
    }))

  if (mode === 'full-wipe') {
    return {
      mode,
      targets: ['claude', 'codex', ...(trackedShellRcFiles.length > 0 ? (['shell'] as const) : [])],
    }
  }

  const targets = await promptCheckbox<UninstallTarget>({
    io,
    message: 'Which integrations should be removed?',
    choices: [
      {
        value: 'claude',
        name: 'claude',
        description: 'Remove Claude hooks, generated script, and installer-owned MCP registration.',
      },
      {
        value: 'codex',
        name: 'codex',
        description: 'Remove Codex hooks, generated script, and installer-owned MCP registration.',
      },
      ...(trackedShellRcFiles.length > 0
        ? [
            {
              value: 'shell' as const,
              name: 'shell',
              description: `Remove tracked PATH blocks from ${trackedShellRcFiles.length} shell rc file(s).`,
            },
          ]
        : []),
    ],
  })

  return {
    mode,
    targets,
  }
}

const createParser = (argv: string[], io: CliIO) => {
  let result: CliResult = { code: 0 }

  const withRuntimeApp = async (handler: RuntimeAppHandler): Promise<void> => {
    const app = await buildRuntimeApp()

    try {
      result = await handler(app)
    } finally {
      app.close()
    }
  }

  const parser = yargs(argv)
    .scriptName('hippo')
    .strict()
    .help()
    .exitProcess(false)
    .recommendCommands()
    .fail((message, error) => {
      throw error ?? new Error(message)
    })
    .command({
      command: 'init',
      describe: 'Initialize local Hippocampus state.',
      builder: parser =>
        parser.option('json', {
          type: 'boolean',
          default: false,
        }),
      handler: async args => {
        const app = await buildApp({ mode: 'init' })
        if (app.mode !== 'init') {
          throw new Error('Expected init app container.')
        }

        result = await runInitCommand(app, io, args.json ?? false)
      },
    })
    .command({
      command: 'apply',
      describe: 'Apply a structured observation to the memory workflow.',
      builder: parser =>
        parser
          .option('scope-type', {
            type: 'string',
            choices: ['user', 'repo', 'org'] as const,
          })
          .option('scope-id', {
            type: 'string',
          })
          .option('type', {
            type: 'string',
            choices: MEMORY_TYPES,
          })
          .option('subject', {
            type: 'string',
          })
          .option('statement', {
            type: 'string',
          })
          .option('origin', {
            type: 'string',
            choices: MEMORY_ORIGINS,
          })
          .option('details', {
            type: 'string',
          })
          .option('input', {
            type: 'string',
          })
          .option('input-file', {
            type: 'string',
          })
          .option('json', {
            type: 'boolean',
            default: false,
      }),
      handler: async args => {
        const applyArgs = args as ApplyArgs
        await withRuntimeApp(app => runApplyCommand(app, loadApplyInput(applyArgs, argv), io, applyArgs.json ?? false))
      },
    })
    .command({
      command: 'search',
      describe: 'Search active memories within a scope.',
      builder: parser =>
        parser
          .option('scope-type', {
            type: 'string',
            choices: ['user', 'repo', 'org'] as const,
          })
          .option('scope-id', {
            type: 'string',
          })
          .option('type', {
            type: 'string',
            choices: MEMORY_TYPES,
          })
          .option('subject', {
            type: 'string',
          })
          .option('limit', {
            type: 'number',
          })
          .option('match-mode', {
            type: 'string',
            choices: ['exact', 'hybrid'] as const,
          })
          .option('json', {
            type: 'boolean',
            default: false,
          }),
      handler: async args => {
        const searchArgs = args as SearchArgs
        await withRuntimeApp(
          app =>
            runSearchCommand(
              app,
              {
                scope: resolveScope(searchArgs),
                type: searchArgs.type ?? null,
                subject: searchArgs.subject ?? '',
                limit: searchArgs.limit ?? null,
                matchMode: searchArgs.matchMode ?? null,
              },
              io,
              searchArgs.json ?? false,
            ),
        )
      },
    })
    .command({
      command: 'get-policy',
      describe: 'Return the current effective policy and guidance references.',
      builder: parser =>
        parser.option('json', {
          type: 'boolean',
          default: false,
        }),
      handler: async args => {
        await withRuntimeApp(app => runGetPolicyCommand(app, io, args.json ?? false))
      },
    })
    .command({
      command: 'mcp serve',
      describe: 'Start the local MCP stdio server.',
      handler: async () => {
        const app = await buildApp({ mode: 'runtime', allowLazyInit: true })
        if (app.mode !== 'runtime') {
          throw new Error('Expected runtime app container.')
        }

        result = await runMcpServeCommand(app)
      },
    })
    .command({
      command: 'setup <target> [rc-file]',
      describe: 'Install proactive memory bootstrap wiring or local shell PATH setup.',
      builder: parser =>
        parser
          .positional('target', {
            type: 'string',
            choices: ['claude', 'codex', 'shell'] as const,
          })
          .positional('rc-file', {
            type: 'string',
          })
          .option('dry-run', {
            type: 'boolean',
            default: false,
          }),
      handler: async args => {
        const target = args.target as 'claude' | 'codex' | 'shell'
        const options = {
          dryRun: Boolean(args.dryRun),
        }

        if (target === 'shell') {
          if (typeof args.rcFile !== 'string' || args.rcFile.length === 0) {
            throw new Error('setup shell requires <rc-file>.')
          }

          result = runSetupShellCommand(io, {
            ...options,
            rcFilePath: args.rcFile,
          })
          return
        }

        if (target === 'claude') {
          result = runSetupClaudeCommand(io, options)
          return
        }

        result = runSetupCodexCommand(io, options)
      },
    })
    .command({
      command: 'uninstall [target] [rc-file]',
      describe: 'Remove proactive memory bootstrap wiring or local shell PATH setup.',
      builder: parser =>
        parser
          .positional('target', {
            type: 'string',
            choices: ['claude', 'codex', 'shell'] as const,
          })
          .positional('rc-file', {
            type: 'string',
          })
          .option('dry-run', {
            type: 'boolean',
            default: false,
          })
          .option('mode', {
            type: 'string',
            choices: ['mcp-hooks-only', 'full-wipe'] as const,
          })
          .option('yes', {
            type: 'boolean',
            default: false,
          }),
      handler: async args => {
        const uninstallArgs = args as unknown as UninstallArgs
        const interactive = isInteractiveIo({ io })
        const options = {
          dryRun: Boolean(uninstallArgs.dryRun),
        }

        if (uninstallArgs.mode === 'full-wipe') {
          if (uninstallArgs.target) {
            throw new Error('`hippo uninstall --mode full-wipe` is global. Omit <target>.')
          }

          await confirmDestructiveAction({
            io,
            enabled: interactive && !options.dryRun && !uninstallArgs.yes,
            message: `Delete all installer-managed integrations and remove ${process.env.HIPPOCAMPUS_HOME ?? '~/.hippocampus'}?`,
          })

          result = runManagedUninstallCommand(io, {
            ...options,
            mode: 'full-wipe',
            targets: ['claude', 'codex', ...(listTrackedShellRcFiles().length > 0 ? (['shell'] as const) : [])],
          })
          return
        }

        if (!uninstallArgs.target) {
          if (!interactive) {
            throw new Error('uninstall requires <target> outside an interactive terminal.')
          }

          const selection = await resolveInteractiveUninstall({
            args: uninstallArgs,
            io,
          })

          await confirmDestructiveAction({
            io,
            enabled: !options.dryRun && !uninstallArgs.yes,
            message:
              selection.mode === 'full-wipe'
                ? `Delete all installer-managed integrations and remove ${process.env.HIPPOCAMPUS_HOME ?? '~/.hippocampus'}?`
                : `Remove installer-managed integrations for: ${selection.targets.join(', ')}?`,
          })

          result = runManagedUninstallCommand(io, {
            ...options,
            mode: selection.mode,
            targets: selection.targets,
          })
          return
        }

        if (uninstallArgs.target === 'shell') {
          if (typeof uninstallArgs.rcFile !== 'string' || uninstallArgs.rcFile.length === 0) {
            throw new Error('uninstall shell requires <rc-file>.')
          }

          await confirmDestructiveAction({
            io,
            enabled: interactive && !options.dryRun && !uninstallArgs.yes,
            message: `Remove the Hippocampus PATH block from ${uninstallArgs.rcFile}?`,
          })

          result = runUninstallShellCommand(io, {
            ...options,
            rcFilePath: uninstallArgs.rcFile,
          })
          return
        }

        await confirmDestructiveAction({
          io,
          enabled: interactive && !options.dryRun && !uninstallArgs.yes,
          message: `Remove installer-managed ${uninstallArgs.target} integration?`,
        })

        if (uninstallArgs.target === 'claude') {
          result = runUninstallClaudeCommand(io, options)
          return
        }

        result = runUninstallCodexCommand(io, options)
      },
    })
    .command({
      command: 'memories <command>',
      describe: 'Inspect and manage stored memories.',
      builder: parser =>
        parser
          .demandCommand(1)
          .command({
            command: 'list',
            describe: 'List active memories in a scope.',
            builder: commandParser =>
              commandParser
                .option('scope-type', {
                  type: 'string',
                  choices: ['user', 'repo', 'org'] as const,
                })
                .option('scope-id', {
                  type: 'string',
                })
                .option('type', {
                  type: 'string',
                  choices: MEMORY_TYPES,
                })
                .option('limit', {
                  type: 'number',
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              await withRuntimeApp(app =>
                runMemoriesListCommand(
                  app,
                  {
                    scope: resolveScope({
                      scopeType: args.scopeType as ScopeType | undefined,
                      scopeId: typeof args.scopeId === 'string' ? args.scopeId : undefined,
                    }),
                    type: typeof args.type === 'string' ? (args.type as MemoryType) : null,
                    limit: typeof args.limit === 'number' ? args.limit : null,
                  },
                  io,
                  Boolean(args.json),
                ),
              )
            },
          })
          .command({
            command: 'archive-stale',
            describe: 'Archive stale active and candidate memories.',
            builder: commandParser =>
              commandParser
                .option('older-than-days', {
                  type: 'number',
                })
                .option('dry-run', {
                  type: 'boolean',
                  default: false,
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              await withRuntimeApp(app =>
                runMemoriesArchiveStaleCommand(
                  app,
                  {
                    olderThanDays: typeof args.olderThanDays === 'number' ? args.olderThanDays : null,
                    dryRun: Boolean(args.dryRun),
                  },
                  io,
                  Boolean(args.json),
                ),
              )
            },
          })
          .command({
            command: 'maintain',
            describe: 'Flush decayed retrieval strength for boosted active memories. Runs in bounded batches; re-run to process more. Without --scope-type/--scope-id runs across all scopes.',
            builder: commandParser =>
              commandParser
                .option('scope-type', {
                  type: 'string',
                  choices: ['user', 'repo', 'org'] as const,
                })
                .option('scope-id', {
                  type: 'string',
                })
                .option('batch-size', {
                  type: 'number',
                })
                .option('dry-run', {
                  type: 'boolean',
                  default: false,
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              const scopeType = args.scopeType as ScopeType | undefined
              const scopeId = typeof args.scopeId === 'string' ? args.scopeId : undefined

              if ((scopeType != null) !== (scopeId != null)) {
                throw new Error('--scope-type and --scope-id must be provided together or not at all.')
              }

              const scope =
                scopeType && scopeId
                  ? ({ type: scopeType, id: scopeId } satisfies ScopeRef)
                  : null

              await withRuntimeApp(app =>
                runMemoriesMaintainCommand(
                  app,
                  {
                    scope,
                    batchSize: typeof args.batchSize === 'number' ? args.batchSize : null,
                    dryRun: Boolean(args.dryRun),
                  },
                  io,
                  Boolean(args.json),
                ),
              )
            },
          })
          .command({
            command: 'inspect',
            describe: 'Inspect a single memory by id.',
            builder: commandParser =>
              commandParser
                .option('id', {
                  type: 'string',
                  demandOption: true,
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              await withRuntimeApp(app =>
                runMemoriesInspectCommand(app, { id: String(args.id) }, io, Boolean(args.json)),
              )
            },
          })
          .command({
            command: 'history',
            describe: 'Show the event history for a memory.',
            builder: commandParser =>
              commandParser
                .option('id', {
                  type: 'string',
                  demandOption: true,
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              await withRuntimeApp(app =>
                runMemoriesHistoryCommand(app, { id: String(args.id) }, io, Boolean(args.json)),
              )
            },
          })
          .command({
            command: 'delete',
            describe: 'Soft delete a memory by id.',
            builder: commandParser =>
              commandParser
                .option('id', {
                  type: 'string',
                })
                .option('yes', {
                  type: 'boolean',
                  default: false,
                })
                .option('json', {
                  type: 'boolean',
                  default: false,
                }),
            handler: async args => {
              const interactive = isInteractiveIo({ io, json: Boolean(args.json) })
              const id =
                typeof args.id === 'string' && args.id.length > 0
                  ? args.id
                  : interactive
                    ? await promptInput({
                        io,
                        message: 'Memory id to delete:',
                        validate: value => (value.trim().length > 0 ? true : 'Memory id is required.'),
                      })
                    : null

              if (!id) {
                throw new Error('memories delete requires --id outside an interactive terminal.')
              }

              await confirmDestructiveAction({
                io,
                enabled: interactive && !args.yes,
                message: `Soft delete memory ${id}?`,
              })

              await withRuntimeApp(app =>
                runMemoriesDeleteCommand(
                  app,
                  { id: String(id).trim(), source: { channel: 'cli' } },
                  io,
                  Boolean(args.json),
                ),
              )
            },
          }),
      handler: () => undefined,
    })

  return { parser, getResult: () => result }
}

export const runCli = async (
  argv: string[],
  io: CliIO = { stdout: process.stdout, stderr: process.stderr },
): Promise<CliResult> => {
  const { parser, getResult } = createParser(argv, io)

  if (argv.length === 0) {
    writeOutput(io, parser.getHelp(), false)
    return { code: 0 }
  }

  await parser.parseAsync()
  return getResult()
}
