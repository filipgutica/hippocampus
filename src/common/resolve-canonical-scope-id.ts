import type { ScopeRef } from './types/scope-ref.js'

export const resolveCanonicalScopeId = (_type: ScopeRef['type'], id: string): string => id.trim()
