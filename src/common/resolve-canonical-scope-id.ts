import fs from 'node:fs'
import type { ScopeRef } from './types/scope-ref.js'

export const resolveCanonicalScopeId = (type: ScopeRef['type'], id: string): string => {
  const trimmedId = id.trim()

  if (type !== 'repo') {
    return trimmedId
  }

  if (!trimmedId || !fs.existsSync(trimmedId)) {
    return trimmedId
  }

  try {
    return fs.realpathSync(trimmedId)
  } catch {
    return trimmedId
  }
}
