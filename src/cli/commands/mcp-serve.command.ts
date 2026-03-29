import type { RuntimeApp } from '../../app/build-app.js'
import type { CliResult } from './shared.js'

export const runMcpServeCommand = async (app: RuntimeApp): Promise<CliResult> => {
  await app.startMcpServer()
  return { code: 0 }
}
