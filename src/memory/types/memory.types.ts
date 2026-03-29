export type MemorySourceType = 'explicit_user_statement' | 'observed_pattern' | 'tool_observation'

export type MemoryStatus = 'candidate' | 'active' | 'suppressed' | 'archived' | 'deleted'

export type MemoryEventType = 'created' | 'reinforced' | 'rejected' | 'contradicted' | 'deleted'

export type ApplyMemoryDecision =
  | { decision: 'reject'; reason: string; policyVersion: string }
  | { decision: 'create'; reason: string; policyVersion: string }
  | { decision: 'reinforce'; reason: string; policyVersion: string }
