import type { ScopeRef } from '../../common/types/scope-ref.js'
import type { MemoryType } from '../types/memory.types.js'

export type SearchMatchMode = 'exact' | 'hybrid'

export type SearchMemoriesInput = {
  scope: ScopeRef
  type?: MemoryType | null
  subject: string
  limit?: number | null
  matchMode?: Exclude<SearchMatchMode, 'semantic'> | null
}
