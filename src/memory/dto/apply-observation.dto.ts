import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryOrigin, MemoryType } from '../types/memory.types.js'

export type ObservationSource = {
  channel: 'cli' | 'mcp'
  agent?: string
  runId?: string
}

export type MemoryDraftInput = {
  scope: ScopeRef
  type: MemoryType
  subject: string
  statement: string
  origin: MemoryOrigin
  details?: string | null
}

export type ApplyObservationInput = MemoryDraftInput & {
  source?: ObservationSource | null
}
