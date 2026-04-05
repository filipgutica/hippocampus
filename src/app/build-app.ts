import { resolveAppPaths, type AppPaths } from './paths.js'
import { InitService, type InitResult } from './init.service.js'
import { defaultConfig, readConfig } from './config.js'
import { initializeDatabase } from '../common/db/db.js'
import { assertRuntimeCompatibility } from './runtime-compatibility.js'
import { MemoryEmbeddingRepository } from '../memory/memory-embedding.repository.js'
import { MemoryRepository } from '../memory/memory.repository.js'
import { MemoryEventRepository } from '../memory/memory-event.repository.js'
import { MemoryRuntimeStateRepository } from '../memory/memory-runtime-state.repository.js'
import { MemoryOwnershipRepository } from '../memory/memory-ownership.repository.js'
import { LocalEmbeddingProvider } from '../memory/local-embedding-provider.js'
import { MEMORY_POLICY_VERSION } from '../memory/policies/memory.policy.js'
import { MemoryService } from '../memory/memory.service.js'
import { createMcpServer } from '../mcp/server.js'
import { ProjectRepository } from '../projects/project.repository.js'

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

  const initResult = options.allowLazyInit
    ? initService.ensureInitialized()
    : {
        config:
          readConfig(paths.configFile) ?? defaultConfig({ dbFile: paths.dbFile }),
      }
  const db = initializeDatabase(initResult.config.dbFile)
  assertRuntimeCompatibility({ config: initResult.config, db })
  const projectRepository = new ProjectRepository(db)
  const memoryOwnershipRepository = new MemoryOwnershipRepository({
    db,
    currentUserId: initResult.config.currentUserId,
    projectRepository,
  })
  const memoryEmbeddingRepository = new MemoryEmbeddingRepository(db)
  const memoryRepository = new MemoryRepository({
    db,
    ownershipRepository: memoryOwnershipRepository,
  })
  const memoryEventRepository = new MemoryEventRepository(db)
  const memoryRuntimeStateRepository = new MemoryRuntimeStateRepository(db)
  const memoryService = new MemoryService({
    embeddingProvider: new LocalEmbeddingProvider({
      cacheDir: paths.transformersCacheDir,
    }),
    memoryEmbeddingRepository,
    memoryRepository,
    memoryEventRepository,
    memoryRuntimeStateRepository,
    projectRepository,
    policyVersion: MEMORY_POLICY_VERSION,
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
