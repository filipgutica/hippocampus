import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ApplyObservationInput, ObservationSource } from '../dto/apply-observation.dto.js'
import type { MemoryEventType, MemoryType } from '../memory.types.js'

export type MemoryEventRecord = {
  id: string
  memoryId: string | null
  eventType: MemoryEventType
  scope: ScopeRef
  type: MemoryType
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
