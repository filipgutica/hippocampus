import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '../common/errors.js'

type TransformersModule = typeof import('@huggingface/transformers')
type FeatureExtractor = Awaited<ReturnType<TransformersModule['pipeline']>>

const MODEL_SOURCE = 'https://huggingface.co/Xenova/bge-small-en-v1.5'
const MODEL_ID = 'Xenova/bge-small-en-v1.5'

const listCachedModelFiles = (rootPath: string): string[] => {
  if (!fs.existsSync(rootPath)) {
    return []
  }

  const files: string[] = []
  const queue = ['']

  while (queue.length > 0) {
    const next = queue.shift()
    if (next == null) {
      continue
    }

    const currentPath = path.join(rootPath, next)
    const entries = fs.readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const relativePath = next ? path.join(next, entry.name) : entry.name
      if (entry.isDirectory()) {
        queue.push(relativePath)
        continue
      }

      if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }

  return files
}

const toNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'number')) {
      return value
    }

    if (value.length === 1) {
      return toNumberArray(value[0])
    }
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView) && 'length' in value) {
    return Array.from(value as unknown as ArrayLike<number>, item => Number(item))
  }

  if (value && typeof value === 'object' && 'data' in value) {
    return toNumberArray(value.data)
  }

  if (value && typeof value === 'object' && 'tolist' in value && typeof value.tolist === 'function') {
    return toNumberArray(value.tolist())
  }

  throw new AppError('SEMANTIC_EMBEDDING_INVALID', 'Embedding pipeline returned an unexpected output shape.')
}

const loadTransformersModule = async (): Promise<TransformersModule> => (await import('@huggingface/transformers')) as TransformersModule

export class LocalEmbeddingProvider {
  private readonly cacheDir: string
  private extractor: FeatureExtractor | null = null
  private modelFingerprint: string | null = null

  constructor({ cacheDir }: { cacheDir: string }) {
    this.cacheDir = cacheDir
  }

  getModelId(): string {
    return MODEL_ID
  }

  getCacheDir(): string {
    return this.cacheDir
  }

  getModelSource(): string {
    return MODEL_SOURCE
  }

  async getModelFingerprint(): Promise<string> {
    if (this.modelFingerprint) {
      return this.modelFingerprint
    }

    await this.getExtractor()

    const hash = createHash('sha256')
    const cachedModelRoot = path.join(this.cacheDir, MODEL_ID)
    const cachedFiles = listCachedModelFiles(cachedModelRoot)

    if (cachedFiles.length === 0) {
      throw new AppError(
        'SEMANTIC_MODEL_NOT_AVAILABLE',
        `Semantic retrieval cache is unavailable for ${MODEL_ID} under ${this.cacheDir}.`,
      )
    }

    for (const relativePath of cachedFiles) {
      hash.update(relativePath)
      hash.update(fs.readFileSync(path.join(cachedModelRoot, relativePath)))
    }

    this.modelFingerprint = hash.digest('hex')
    return this.modelFingerprint
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (this.extractor) {
      return this.extractor
    }

    try {
      fs.mkdirSync(this.cacheDir, { recursive: true })
      const transformers = await loadTransformersModule()
      transformers.env.cacheDir = this.cacheDir
      transformers.env.allowRemoteModels = true
      this.extractor = await transformers.pipeline('feature-extraction', MODEL_ID, {
        cache_dir: this.cacheDir,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      throw new AppError(
        'SEMANTIC_MODEL_NOT_AVAILABLE',
        `Semantic retrieval with ${MODEL_ID} is unavailable. Cached models live under ${this.cacheDir}. ${message}`,
      )
    }

    return this.extractor
  }

  async embed(input: string): Promise<number[]> {
    const extractor = await this.getExtractor()
    const output = await extractor(input, {
      pooling: 'mean',
      normalize: true,
    })

    return toNumberArray(output)
  }
}

export type EmbeddingProvider = Pick<
  LocalEmbeddingProvider,
  'embed' | 'getCacheDir' | 'getModelFingerprint' | 'getModelId' | 'getModelSource'
>
