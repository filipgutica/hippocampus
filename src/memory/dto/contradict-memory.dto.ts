import type { ObservationSource, MemoryDraftInput } from './apply-observation.dto.js'

export type ContradictMemoryInput = {
  id: string
  replacement: MemoryDraftInput
  source?: ObservationSource | null
}
