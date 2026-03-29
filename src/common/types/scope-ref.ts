export type ScopeType = 'user' | 'repo' | 'org'

export type ScopeRef = {
  type: ScopeType
  id: string
}
