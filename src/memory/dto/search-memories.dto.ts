import type { ScopeRef } from '../../common/types/scope-ref.js'

export type SearchMemoriesInput = {
  scope: ScopeRef
  kind?: string | null
  subject?: string | null
  limit?: number | null
}
