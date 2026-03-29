import type { ScopeRef } from '../../common/types/scope-ref.js'

export type ListMemoriesInput = {
  scope: ScopeRef
  kind?: string | null
  limit?: number | null
}
