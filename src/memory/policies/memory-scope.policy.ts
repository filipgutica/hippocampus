import { AppError } from '../../common/errors.js'
import type { ScopeRef } from '../../common/types/scope-ref.js'

export const validateScope = (scope: ScopeRef): ScopeRef => {
  if (!scope.type || !['user', 'project'].includes(scope.type)) {
    throw new AppError('INVALID_SCOPE', 'Scope type must be one of user or project.')
  }

  if (!scope.id.trim()) {
    throw new AppError('INVALID_SCOPE', 'Scope id must not be empty.')
  }

  return {
    type: scope.type,
    id: scope.id.trim(),
  }
}
