import type { ObservationSource } from './apply-observation.dto.js'

export type DeleteMemoryInput = {
  id: string
  source?: ObservationSource | null
}
