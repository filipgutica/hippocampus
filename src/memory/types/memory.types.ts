export type MemoryStatus = 'active' | 'deleted'

export type MemoryEventType = 'created' | 'reinforced' | 'rejected' | 'deleted'

export type ApplyMemoryDecision =
  | { decision: 'reject'; reason: string; policyVersion: string }
  | { decision: 'create'; reason: string; policyVersion: string }
  | { decision: 'reinforce'; reason: string; policyVersion: string }
