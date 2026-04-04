import type { MemoryDraftInput, ObservationSource } from './apply-observation.dto.js'
import type { MemoryEventEntity } from '../entities/memory-event.entity.js'

export type MemoryEventDto = Omit<MemoryEventEntity, 'observationJson' | 'sourceJson'> & {
  observation: MemoryDraftInput | null
  source: ObservationSource | null
}
