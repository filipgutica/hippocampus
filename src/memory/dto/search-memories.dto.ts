import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryType } from '../memory.types.js'

export type SearchMemoriesInput = {
  scope: ScopeRef
  type?: MemoryType | null
  subject: string
  limit?: number | null
}
