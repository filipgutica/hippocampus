import { createHash } from 'node:crypto'
import type { Memory } from './types/memory.js'

const norm = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

export const getSemanticSourceText = (memory: Memory): string =>
  [norm(memory.type), norm(memory.subject), norm(memory.statement), norm(memory.details)].filter(Boolean).join('\n')

export const getSourceTextHash = (value: string): string => createHash('sha256').update(value).digest('hex')

export const parseEmbedding = (value: string): number[] => JSON.parse(value) as number[]

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}
