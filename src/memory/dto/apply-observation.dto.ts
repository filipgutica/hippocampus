import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemorySourceType } from '../types/memory.types.js'

export type ObservationSource = {
  channel: 'cli' | 'mcp'
  agent?: string
  runId?: string
}

export type MemoryDraftInput = {
  scope: ScopeRef
  kind: string
  subject: string
  statement: string
  sourceType: MemorySourceType
  details?: string | null
}

export type ApplyObservationInput = MemoryDraftInput & {
  source?: ObservationSource | null
}
