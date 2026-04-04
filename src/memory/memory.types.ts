export const MEMORY_TYPES = ['procedural', 'episodic', 'semantic', 'preference', 'decision'] as const
export const MEMORY_ORIGINS = ['explicit_user_statement', 'observed_pattern', 'tool_observation'] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number]

export type MemoryStatus = 'candidate' | 'active' | 'suppressed' | 'archived' | 'deleted'

export type MemoryEventType = 'created' | 'reinforced' | 'rejected' | 'contradicted' | 'archived' | 'deleted'

export type ApplyMemoryDecision =
  | { decision: 'reject'; reason: string; policyVersion: string }
  | { decision: 'create'; reason: string; policyVersion: string }
  | { decision: 'reinforce'; reason: string; policyVersion: string }
