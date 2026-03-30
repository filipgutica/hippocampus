import type { ScopeRef } from '../../common/types/scope-ref.js'

export type SearchMatchMode = 'exact' | 'hybrid'

export type SearchMemoriesInput = {
  scope: ScopeRef
  kind?: string | null
  subject: string
  limit?: number | null
  matchMode?: Exclude<SearchMatchMode, 'semantic'> | null
}
