import type { MemoryRecord } from './models/memory-record.js'

export const compareMemoryRank = (left: MemoryRecord, right: MemoryRecord): number => {
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence
  }

  if (right.lastReinforcedAt !== left.lastReinforcedAt) {
    return right.lastReinforcedAt.localeCompare(left.lastReinforcedAt)
  }

  if (right.reinforcementCount !== left.reinforcementCount) {
    return right.reinforcementCount - left.reinforcementCount
  }

  return left.subject.localeCompare(right.subject)
}

export const rankMemories = (items: MemoryRecord[]): MemoryRecord[] =>
  [...items].sort(compareMemoryRank)
