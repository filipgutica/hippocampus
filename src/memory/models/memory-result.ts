import type { GetPolicyResult } from '../dto/get-policy.dto.js'
import type { ApplyMemoryDecision } from '../types/memory.types.js'
import type { MemoryRecord } from './memory-record.js'

export type ApplyMemoryResult =
  | ApplyMemoryDecision
  | { decision: 'create'; reason: string; policyVersion: string; memory: MemoryRecord }
  | { decision: 'reinforce'; reason: string; policyVersion: string; memory: MemoryRecord }

export type SearchResult = {
  items: MemoryRecord[]
  total: number
}

export type { GetPolicyResult }
