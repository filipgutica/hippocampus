import type { MemoryDraftInput, ObservationSource } from './apply-observation.dto.js'
import type { MemoryEvent } from '../types/memory-event.js'

export type MemoryEventDto = Omit<MemoryEvent, 'observationJson' | 'sourceJson'> & {
  observation: MemoryDraftInput | null
  source: ObservationSource | null
}
