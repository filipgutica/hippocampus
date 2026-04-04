import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryType } from '../memory.types.js'

export type ListMemoriesInput = {
  scope: ScopeRef
  type?: MemoryType | null
  limit?: number | null
}
