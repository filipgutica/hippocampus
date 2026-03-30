/* global process */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const providerModulePath = path.join(repoRoot, 'dist', 'memory', 'local-embedding-provider.js')
const pathsModulePath = path.join(repoRoot, 'dist', 'app', 'paths.js')

if (!fs.existsSync(providerModulePath)) {
  throw new Error(`Expected built provider at ${providerModulePath}. Run \`pnpm build\` first.`)
}

const { LocalEmbeddingProvider } = await import(providerModulePath)
const { resolveAppPaths } = await import(pathsModulePath)
const appPaths = resolveAppPaths()
const cacheDir = appPaths.transformersCacheDir

const provider = new LocalEmbeddingProvider({ cacheDir })
const first = await provider.embed('prefer pnpm')
const second = await provider.embed('prefer npm')
const fingerprint = await provider.getModelFingerprint()

if (first.length === 0 || second.length === 0) {
  throw new Error('Expected non-empty semantic embeddings.')
}

if (fingerprint.length === 0) {
  throw new Error('Expected a non-empty model fingerprint.')
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      appHome: appPaths.home,
      modelId: provider.getModelId(),
      cacheDir: provider.getCacheDir(),
      embeddingLength: first.length,
      fingerprintLength: fingerprint.length,
      preview: first.slice(0, 5),
      secondPreview: second.slice(0, 5),
    },
    null,
    2,
  )}\n`,
)
