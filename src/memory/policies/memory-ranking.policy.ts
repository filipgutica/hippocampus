import type { Memory } from '../types/memory.js'

/**
 * Orders two memories by reinforcement first, then recency, then subject text for stable ties.
 */
export const compareMemoryRank = (left: Memory, right: Memory): number => {
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
export const rankMemories = (items: Memory[]): Memory[] =>
  [...items].sort(compareMemoryRank)
