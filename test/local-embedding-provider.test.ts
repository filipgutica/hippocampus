import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const extractor = vi.fn(async () => ({ data: [1, 0, 0] }))
  return {
    env: {
      cacheDir: '',
      allowRemoteModels: false,
    },
    extractor,
    pipeline: vi.fn(async () => extractor),
  }
})

vi.mock('@huggingface/transformers', () => ({
  env: mocks.env,
  pipeline: mocks.pipeline,
}))

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hippo-provider-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

beforeEach(() => {
  mocks.env.cacheDir = ''
  mocks.env.allowRemoteModels = false
  mocks.extractor.mockClear()
  mocks.pipeline.mockClear()
})

describe('LocalEmbeddingProvider', () => {
  it('loads the configured model id with the Hippocampus cache directory and reuses the pipeline', async () => {
    const { LocalEmbeddingProvider } = await import('../src/memory/local-embedding-provider.js')
    const cacheDir = createTempDir()
    const provider = new LocalEmbeddingProvider({ cacheDir })

    await provider.embed('prefer pnpm')
    await provider.embed('prefer npm')

    expect(provider.getModelId()).toBe('Xenova/bge-small-en-v1.5')
    expect(provider.getCacheDir()).toBe(cacheDir)
    expect(mocks.env.cacheDir).toBe(cacheDir)
    expect(mocks.env.allowRemoteModels).toBe(true)
    expect(mocks.pipeline).toHaveBeenCalledTimes(1)
    expect(mocks.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/bge-small-en-v1.5',
      expect.objectContaining({ cache_dir: cacheDir }),
    )
    expect(mocks.extractor).toHaveBeenCalledTimes(2)
  })

  it('accepts typed-array tensor data from the extractor output', async () => {
    const { LocalEmbeddingProvider } = await import('../src/memory/local-embedding-provider.js')
    const cacheDir = createTempDir()
    const provider = new LocalEmbeddingProvider({ cacheDir })

    mocks.extractor.mockResolvedValueOnce({
      ort_tensor: {},
      data: new Float32Array([0.25, 0.5, 0.75]),
    })

    await expect(provider.embed('prefer pnpm')).resolves.toEqual([0.25, 0.5, 0.75])
  })

  it('derives the model fingerprint from cached model artifacts', async () => {
    const { LocalEmbeddingProvider } = await import('../src/memory/local-embedding-provider.js')
    const cacheDir = createTempDir()
    const cachedModelDir = path.join(cacheDir, 'Xenova', 'bge-small-en-v1.5', 'onnx')
    fs.mkdirSync(cachedModelDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'Xenova', 'bge-small-en-v1.5', 'config.json'), '{"model":"a"}')
    fs.writeFileSync(path.join(cachedModelDir, 'model.onnx'), 'model-a')

    const providerA = new LocalEmbeddingProvider({ cacheDir })
    const fingerprintA = await providerA.getModelFingerprint()

    fs.writeFileSync(path.join(cachedModelDir, 'model.onnx'), 'model-b')

    const providerB = new LocalEmbeddingProvider({ cacheDir })
    const fingerprintB = await providerB.getModelFingerprint()

    expect(fingerprintA).not.toBe(fingerprintB)
  })
})
