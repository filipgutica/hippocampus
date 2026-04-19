import type { GetPolicyResult } from './get-policy.dto.js'
import type { ScopeRef, ScopeType } from '../../common/types/scope-ref.js'
import type { ApplyMemoryDecision, MemoryType } from '../memory.types.js'
import type { MemoryDto } from './memory.dto.js'
import type { MemoryEventDto } from './memory-event.dto.js'

export type MemoryGetResult = MemoryDto & {
  supersededByMemory: MemoryDto | null
}

export type ApplyMemoryResult =
  | ApplyMemoryDecision
  | { decision: 'create'; reason: string; policyVersion: string; memory: MemoryDto }
  | { decision: 'reinforce'; reason: string; policyVersion: string; memory: MemoryDto }

export type SearchResult = {
  items: MemoryDto[]
  total: number
}

export type MemoryListResult = {
  items: MemoryDto[]
  total: number
}

export type ArchiveStaleMemoriesResult = {
  dryRun: boolean
  olderThanDays: number | null
  cutoffByScope: Record<ScopeType, string>
  items: MemoryDto[]
  total: number
}

export type MemoryHistoryResult = {
  items: MemoryEventDto[]
  total: number
}

export type DeleteMemoryResult = {
  memory: MemoryDto
  event: MemoryEventDto
}

export type ContradictMemoryResult = {
  contradictedMemory: MemoryDto
  replacementMemory: MemoryDto
  contradictedEvent: MemoryEventDto
  replacementEvent: MemoryEventDto
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
