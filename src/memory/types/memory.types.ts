export type MemoryStatus = 'active'

export type MemoryEventType = 'created' | 'reinforced' | 'rejected'

export type ApplyMemoryDecision =
  | { decision: 'reject'; reason: string; policyVersion: string }
  | { decision: 'create'; reason: string; policyVersion: string }
  | { decision: 'reinforce'; reason: string; policyVersion: string }
