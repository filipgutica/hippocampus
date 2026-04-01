import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ApplyObservationInput, ObservationSource } from '../dto/apply-observation.dto.js'
import type { MemoryEventType, MemorySourceType, MemoryStatus } from '../types/memory.types.js'

export type MemoryRecord = {
  id: string
  scope: ScopeRef
  kind: string
  subject: string
  subjectKey: string
  statement: string
  details: string | null
  sourceType: MemorySourceType
  reinforcementCount: number
  policyVersion: string
  createdAt: string
  updatedAt: string
  lastReinforcedAt: string
  retrievalCount: number
  lastRetrievedAt: string | null
  strength: number
  status: MemoryStatus
  supersededBy: string | null
  deletedAt: string | null
}

export type MemoryGetResult = MemoryRecord & {
  supersededByMemory: MemoryRecord | null
}

export type MemoryEventRecord = {
  id: string
  memoryId: string | null
  eventType: MemoryEventType
  scope: ScopeRef
  kind: string
  subjectKey: string
  observationJson: string
  sourceJson: string | null
  reason: string
  createdAt: string
}

export type ParsedMemoryEventRecord = Omit<MemoryEventRecord, 'observationJson' | 'sourceJson'> & {
  observation: ApplyObservationInput | null
  source: ObservationSource | null
}
