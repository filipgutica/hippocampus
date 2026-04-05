import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryEventType, MemoryType } from '../memory.types.js'

export type MemoryEvent = {
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
