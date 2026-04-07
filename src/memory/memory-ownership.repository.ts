import type Database from 'better-sqlite3'
import { createDrizzleDb, type DrizzleDb } from '../common/db/drizzle.js'
import { usersTable } from '../common/db/schema/index.js'
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
  private readonly drizzleDb: DrizzleDb
  private readonly currentUserId: string
  private readonly projectRepository: ProjectRepository

  constructor(input: { db: InstanceType<typeof Database>; currentUserId: string; projectRepository?: ProjectRepository }) {
    this.drizzleDb = createDrizzleDb(input.db)
    this.currentUserId = input.currentUserId
    this.projectRepository = input.projectRepository ?? new ProjectRepository(input.db)
  }

  ensureCurrentUser(now: string): void {
    this.drizzleDb
      .insert(usersTable)
      .values({
        id: this.currentUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { updatedAt: now },
      })
      .run()
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
