import type { GetPolicyResult } from '../dto/get-policy.dto.js'
import type { SearchMatchMode } from '../dto/search-memories.dto.js'
import type { ScopeRef, ScopeType } from '../../common/types/scope-ref.js'
import type { ApplyMemoryDecision, MemoryType } from '../memory.types.js'
import type { MemoryRecord } from './memory-record.js'
import type { ParsedMemoryEventRecord } from './memory-event-record.js'

export type MemoryGetResult = MemoryRecord & {
  supersededByMemory: MemoryRecord | null
}

export type ApplyMemoryResult =
  | ApplyMemoryDecision
  | { decision: 'create'; reason: string; policyVersion: string; memory: MemoryRecord }
  | { decision: 'reinforce'; reason: string; policyVersion: string; memory: MemoryRecord }

export type SearchResult = {
  items: MemoryRecord[]
  total: number
  matchMode: SearchMatchMode
  requestedMatchMode: SearchMatchMode
  effectiveMatchMode: SearchMatchMode
  fallbackReason?: string
}

export type MemoryListResult = {
  items: MemoryRecord[]
  total: number
}

export type ArchiveStaleMemoriesResult = {
  dryRun: boolean
  olderThanDays: number | null
  cutoffByScope: Record<ScopeType, string>
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

export type MaintenanceFlushEntry = {
  id: string
  scope: ScopeRef
  type: MemoryType
  subject: string
  oldStrength: number
  newStrength: number
}

export type MaintenancePassResult = {
  dryRun: boolean
  batchSize: number
  flushed: MaintenanceFlushEntry[]
  unchanged: number
  total: number
}

export type { GetPolicyResult }
