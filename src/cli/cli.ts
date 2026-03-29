import { buildApp } from '../app/build-app.js'
import { runApplyCommand } from './commands/apply.command.js'
import { runGetPolicyCommand } from './commands/get-policy.command.js'
import { runInitCommand } from './commands/init.command.js'
import { runMcpServeCommand } from './commands/mcp-serve.command.js'
import { runSearchCommand } from './commands/search.command.js'
import { hasFlag, writeOutput, type CliIO, type CliResult } from './commands/shared.js'

export const runCli = async (argv: string[], io: CliIO = { stdout: process.stdout, stderr: process.stderr }): Promise<CliResult> => {
  const [command, subcommand] = argv

  if (!command || hasFlag(argv, '--help')) {
    writeOutput(
      io,
      [
        'hippo init',
        'hippo apply',
        'hippo search',
        'hippo get-policy',
        'hippo mcp serve',
      ].join('\n'),
      false,
    )
    return { code: 0 }
  }

  if (command === 'mcp' && subcommand === 'serve') {
    const app = await buildApp({ mode: 'runtime', allowLazyInit: true })
    if (app.mode !== 'runtime') {
      throw new Error('Expected runtime app container.')
    }
    return runMcpServeCommand(app)
  }

  if (command === 'init') {
    const app = await buildApp({ mode: 'init' })
    if (app.mode !== 'init') {
      throw new Error('Expected init app container.')
    }
    return runInitCommand(app, io)
  }

  const app = await buildApp({ mode: 'runtime', allowLazyInit: false })
  if (app.mode !== 'runtime') {
    throw new Error('Expected runtime app container.')
  }
  try {
    if (command === 'apply') {
      return runApplyCommand(app, argv.slice(1), io)
    }

    if (command === 'search') {
      return runSearchCommand(app, argv.slice(1), io)
    }

    if (command === 'get-policy') {
      return runGetPolicyCommand(app, io)
    }

    throw new Error(`Unknown command: ${command}`)
  } finally {
    if (app.mode === 'runtime') {
      app.close()
    }
  }
}
