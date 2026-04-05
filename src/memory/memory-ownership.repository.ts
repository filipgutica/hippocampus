import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ScopeRef } from '../common/types/scope-ref.js'
import { resolveCanonicalScopeId } from '../common/resolve-canonical-scope-id.js'

export type ResolvedMemoryOwnership = {
  userId: string
  projectId: string | null
  scope: ScopeRef
}

type ProjectRow = {
  id: string
}

export class MemoryOwnershipRepository {
  private readonly db: InstanceType<typeof Database>
  private readonly currentUserId: string

  constructor(input: { db: InstanceType<typeof Database>; currentUserId: string }) {
    this.db = input.db
    this.currentUserId = input.currentUserId
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
    const canonicalScope: ScopeRef = {
      type: scope.type,
      id: this.canonicalizeScope(scope).id,
    }

    if (canonicalScope.type !== 'repo') {
      return {
        userId: this.currentUserId,
        projectId: null,
        scope: canonicalScope,
      }
    }

    const existingProject = this.db
      .prepare(
        `
          SELECT id
          FROM projects
          WHERE canonical_path = ?
          LIMIT 1
        `,
      )
      .get(canonicalScope.id) as ProjectRow | undefined

    if (existingProject) {
      return {
        userId: this.currentUserId,
        projectId: existingProject.id,
        scope: canonicalScope,
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

    if (canonicalScope.type !== 'repo') {
      return {
        userId: this.currentUserId,
        projectId: null,
        scope: canonicalScope,
      }
    }

    const existingProject = this.db
      .prepare(
        `
          SELECT id
          FROM projects
          WHERE canonical_path = ?
          LIMIT 1
        `,
      )
      .get(canonicalScope.id) as ProjectRow | undefined

    if (existingProject) {
      this.db
        .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
        .run(now, existingProject.id)

      return {
        userId: this.currentUserId,
        projectId: existingProject.id,
        scope: canonicalScope,
      }
    }

    const projectId = randomUUID()
    this.db
      .prepare(
        `
          INSERT INTO projects (id, canonical_path, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(projectId, canonicalScope.id, now, now)

    return {
      userId: this.currentUserId,
      projectId,
      scope: canonicalScope,
    }
  }
}
