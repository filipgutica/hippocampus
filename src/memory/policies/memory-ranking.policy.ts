import type { MemoryRecord } from '../models/memory-record.js'

/**
 * Orders two memories by reinforcement first, then recency, then subject text for stable ties.
 */
export const compareMemoryRank = (left: MemoryRecord, right: MemoryRecord): number => {
  if (right.reinforcementCount !== left.reinforcementCount) {
    return right.reinforcementCount - left.reinforcementCount
  }

  if (right.lastReinforcedAt !== left.lastReinforcedAt) {
    return right.lastReinforcedAt.localeCompare(left.lastReinforcedAt)
  }

  return left.subject.localeCompare(right.subject)
}

/**
 * Returns a new array sorted by the repository's ranking rules.
 */
export const rankMemories = (items: MemoryRecord[]): MemoryRecord[] =>
  [...items].sort(compareMemoryRank)
