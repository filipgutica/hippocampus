import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { ObservationSource } from './apply-observation.dto.js'

export type RunMaintenanceInput = {
  scope?: ScopeRef | null
  batchSize?: number | null
  dryRun?: boolean
  source?: ObservationSource | null
}
