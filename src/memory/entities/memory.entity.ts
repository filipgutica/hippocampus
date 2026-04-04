import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryOrigin, MemoryStatus, MemoryType } from '../memory.types.js'

export type MemoryEntity = {
  id: string
  scope: ScopeRef
  type: MemoryType
  subject: string
  subjectKey: string
  statement: string
  details: string | null
  origin: MemoryOrigin
  reinforcementCount: number
  policyVersion: string
  createdAt: string
  updatedAt: string
  lastReinforcedAt: string
  retrievalCount: number
  lastRetrievedAt: string | null
  strength: number
  status: MemoryStatus
  supersededBy: string | null
  deletedAt: string | null
}
