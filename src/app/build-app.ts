import { resolveAppPaths, type AppPaths } from './paths.js'
import { InitService, type InitResult } from './init.service.js'
import { openDatabase } from '../common/db/db.js'
import { MemoryRepository } from '../memory/memory.repository.js'
import { MemoryEventRepository } from '../memory/memory-event.repository.js'
import { MemoryService } from '../memory/memory.service.js'
import { createMcpServer } from '../mcp/server.js'

export type AppBuildMode = 'init' | 'runtime'

export type BuildAppOptions = {
  mode: AppBuildMode
  allowLazyInit?: boolean
  appHomeOverride?: string
}

export type InitApp = {
  mode: 'init'
  paths: AppPaths
  initService: InitService
  initialize: () => InitResult
}

export type RuntimeApp = {
  mode: 'runtime'
  paths: AppPaths
  initService: InitService
  memoryService: MemoryService
  startMcpServer: () => Promise<void>
  close: () => void
}

export type AppContainer = InitApp | RuntimeApp

export const buildApp = async (options: BuildAppOptions): Promise<AppContainer> => {
  const paths = resolveAppPaths(options.appHomeOverride)
  const initService = new InitService(paths)

  if (options.mode === 'init') {
    return {
      mode: 'init',
      paths,
      initService,
      initialize: () => initService.initialize(),
    }
  }

  if (!options.allowLazyInit && !initService.isInitialized()) {
    throw new Error(`Hippocampus is not initialized. Run \`hippo init\` first. App home: ${paths.home}`)
  }

  const initResult = options.allowLazyInit ? initService.ensureInitialized() : { config: { dbFile: paths.dbFile } }
  const db = openDatabase(initResult.config.dbFile)
  const memoryRepository = new MemoryRepository(db)
  const memoryEventRepository = new MemoryEventRepository(db)
  const memoryService = new MemoryService({
    memoryRepository,
    memoryEventRepository,
    policyVersion: '1',
    db,
  })

  return {
    mode: 'runtime',
    paths,
    initService,
    memoryService,
    startMcpServer: async () => {
      const server = createMcpServer(memoryService)
      await server.start()
    },
    close: () => db.close(),
  }
}
