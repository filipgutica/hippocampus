import type Database from 'better-sqlite3'
import { AppError } from '../common/errors.js'
import type { ScopeRef } from '../common/types/scope-ref.js'
import { resolveCanonicalScopeId } from '../common/resolve-canonical-scope-id.js'
import { ProjectRepository } from '../projects/project.repository.js'

export type ResolvedMemoryOwnership = {
  userId: string
  projectId: string | null
  scope: ScopeRef
}

export class MemoryOwnershipRepository {
  private readonly db: InstanceType<typeof Database>
  private readonly currentUserId: string
  private readonly projectRepository: ProjectRepository

  constructor(input: { db: InstanceType<typeof Database>; currentUserId: string; projectRepository?: ProjectRepository }) {
    this.db = input.db
    this.currentUserId = input.currentUserId
    this.projectRepository = input.projectRepository ?? new ProjectRepository(input.db)
  }

  ensureCurrentUser(now: string): void {
    this.db
      .prepare(
        `
          INSERT INTO users (id, created_at, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
        `,
      )
      .run(this.currentUserId, now, now)
  }

  private canonicalizeScope(scope: ScopeRef): ScopeRef {
    return {
      type: scope.type,
      id: resolveCanonicalScopeId(scope.type, scope.id),
    }
  }

  resolveReadScope(scope: ScopeRef): ResolvedMemoryOwnership {
    const canonicalScope = this.canonicalizeScope(scope)

    if (canonicalScope.type !== 'project') {
      return {
        userId: this.currentUserId,
        projectId: null,
        scope: canonicalScope,
      }
    }

    const existingProject =
      this.projectRepository.getById(canonicalScope.id) ??
      this.projectRepository.resolveExistingProjectForPath(canonicalScope.id)

    if (existingProject) {
      return {
        userId: this.currentUserId,
        projectId: existingProject.id,
        scope: existingProject.scope,
      }
    }

    return {
      userId: this.currentUserId,
      projectId: null,
      scope: canonicalScope,
    }
  }

  resolveWriteScope(scope: ScopeRef, now: string): ResolvedMemoryOwnership {
    this.ensureCurrentUser(now)

    const canonicalScope = this.canonicalizeScope(scope)

    if (canonicalScope.type !== 'project') {
      return {
        userId: this.currentUserId,
        projectId: null,
        scope: canonicalScope,
      }
    }

    const existingProject =
      this.projectRepository.getById(canonicalScope.id) ??
      this.projectRepository.resolveExistingProjectForPath(canonicalScope.id)
    if (!existingProject) {
      throw new AppError(
        'INVALID_SCOPE',
        'Unknown project scope id. Run `hippo project ensure` first to register the current project.',
      )
    }

    return {
      userId: this.currentUserId,
      projectId: existingProject.id,
      scope: existingProject.scope,
    }
  }
}
