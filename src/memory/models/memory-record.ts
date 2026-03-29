import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryEventType, MemoryStatus } from '../types/memory.types.js'

export type MemoryRecord = {
  id: string
  scope: ScopeRef
  kind: string
  subject: string
  subjectKey: string
  statement: string
  details: string | null
  confidence: number
  reinforcementCount: number
  policyVersion: string
  createdAt: string
  updatedAt: string
  lastObservedAt: string
  status: MemoryStatus
}

export type MemoryEventRecord = {
  id: string
  memoryId: string | null
  eventType: MemoryEventType
  scope: ScopeRef
  kind: string
  subjectKey: string
  observationJson: string
  sourceJson: string | null
  reason: string
  createdAt: string
}
