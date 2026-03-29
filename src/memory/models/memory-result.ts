import type { GetPolicyResult } from '../dto/get-policy.dto.js'
import type { ApplyMemoryDecision } from '../types/memory.types.js'
import type { MemoryGetResult, MemoryRecord, ParsedMemoryEventRecord } from './memory-record.js'

export type ApplyMemoryResult =
  | ApplyMemoryDecision
  | { decision: 'create'; reason: string; policyVersion: string; memory: MemoryRecord }
  | { decision: 'reinforce'; reason: string; policyVersion: string; memory: MemoryRecord }

export type SearchResult = {
  items: MemoryRecord[]
  total: number
}

export type MemoryListResult = {
  items: MemoryRecord[]
  total: number
}

export type MemoryHistoryResult = {
  items: ParsedMemoryEventRecord[]
  total: number
}

export type DeleteMemoryResult = {
  memory: MemoryRecord
  event: ParsedMemoryEventRecord
}

export type ContradictMemoryResult = {
  contradictedMemory: MemoryRecord
  replacementMemory: MemoryRecord
  contradictedEvent: ParsedMemoryEventRecord
  replacementEvent: ParsedMemoryEventRecord
}

export type { MemoryGetResult }

export type { GetPolicyResult }
