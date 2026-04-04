import type { MemoryEntity } from '../entities/memory.entity.js'
import type { ObservationSource } from './apply-observation.dto.js'

export type LatestMemoryEventSummaryDto = {
  eventType: 'created' | 'reinforced' | 'rejected' | 'contradicted' | 'archived' | 'deleted'
  createdAt: string
  source: ObservationSource | null
}

export type MemoryDto = MemoryEntity & {
  latestEventSummary: LatestMemoryEventSummaryDto | null
}
