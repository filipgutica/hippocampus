import type { MemoryRecord } from './models/memory-record.js'

export const rankMemories = (items: MemoryRecord[]): MemoryRecord[] =>
  [...items].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence
    }

    if (right.lastObservedAt !== left.lastObservedAt) {
      return right.lastObservedAt.localeCompare(left.lastObservedAt)
    }

    if (right.reinforcementCount !== left.reinforcementCount) {
      return right.reinforcementCount - left.reinforcementCount
    }

    return left.subject.localeCompare(right.subject)
  })
