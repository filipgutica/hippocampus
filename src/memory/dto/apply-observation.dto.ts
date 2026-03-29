import type { ScopeRef } from '../../common/types/scope-ref.js'

export type ObservationSource = {
  channel: 'cli' | 'mcp'
  agent?: string
  runId?: string
}

export type ApplyObservationInput = {
  scope: ScopeRef
  kind: string
  subject: string
  statement: string
  details?: string | null
  source?: ObservationSource | null
}
