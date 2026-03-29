#!/usr/bin/env node
import { runCli } from './cli/cli.js'

const main = async (): Promise<void> => {
  try {
    const result = await runCli(process.argv.slice(2))
    if (result.code !== 0) {
      process.exitCode = result.code
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

await main()
