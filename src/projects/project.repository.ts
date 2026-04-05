import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { and, eq } from 'drizzle-orm'
import { AppError } from '../common/errors.js'
import { createDrizzleDb } from '../common/db/drizzle.js'
import { projectPathsTable, projectsTable } from '../common/db/schema/index.js'
import { inspectProjectPath } from './project-identity.js'
import type { EnsuredProject } from './project.types.js'

export class ProjectRepository {
  private readonly drizzleDb

  constructor(db: InstanceType<typeof Database>) {
    this.drizzleDb = createDrizzleDb(db)
  }

  getById(projectId: string): EnsuredProject | null {
    const row = this.drizzleDb
      .select({
        id: projectsTable.id,
        identitySource: projectsTable.identitySource,
        identityValue: projectsTable.identityValue,
      })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .get()

    if (!row) {
      return null
    }

    return {
      id: row.id,
      scope: { type: 'project', id: row.id },
      identitySource: row.identitySource as EnsuredProject['identitySource'],
      identityValue: row.identityValue,
      repoRoot: '',
      created: false,
    }
  }

  ensureProjectForPath({
    inputPath,
    now,
  }: {
    inputPath: string
    now: string
  }): EnsuredProject {
    const inspected = inspectProjectPath({
      inputPath,
      allowCreateLocalIdentity: true,
    })

    const existing = this.drizzleDb
      .select({
        id: projectsTable.id,
        identitySource: projectsTable.identitySource,
        identityValue: projectsTable.identityValue,
      })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.identitySource, inspected.identitySource),
          eq(projectsTable.identityValue, inspected.identityValue),
        ),
      )
      .get()

    if (existing) {
      this.drizzleDb
        .update(projectsTable)
        .set({ updatedAt: now })
        .where(eq(projectsTable.id, existing.id))
        .run()

      this.upsertProjectPath({
        projectId: existing.id,
        canonicalPath: inspected.repoRoot,
        now,
      })

      return {
        id: existing.id,
        scope: { type: 'project', id: existing.id },
        identitySource: existing.identitySource as EnsuredProject['identitySource'],
        identityValue: existing.identityValue,
        repoRoot: inspected.repoRoot,
        created: false,
      }
    }

    const projectId = randomUUID()
    this.drizzleDb
      .insert(projectsTable)
      .values({
        id: projectId,
        identitySource: inspected.identitySource,
        identityValue: inspected.identityValue,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    this.upsertProjectPath({
      projectId,
      canonicalPath: inspected.repoRoot,
      now,
    })

    return {
      id: projectId,
      scope: { type: 'project', id: projectId },
      identitySource: inspected.identitySource,
      identityValue: inspected.identityValue,
      repoRoot: inspected.repoRoot,
      created: true,
    }
  }

  resolveExistingProjectForPath(inputPath: string): EnsuredProject | null {
    let inspected: ReturnType<typeof inspectProjectPath>
    try {
      inspected = inspectProjectPath({
        inputPath,
        allowCreateLocalIdentity: false,
      })
    } catch {
      return null
    }

    if (!inspected.identityValue) {
      return null
    }

    const existing = this.drizzleDb
      .select({
        id: projectsTable.id,
        identitySource: projectsTable.identitySource,
        identityValue: projectsTable.identityValue,
      })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.identitySource, inspected.identitySource),
          eq(projectsTable.identityValue, inspected.identityValue),
        ),
      )
      .get()

    if (!existing) {
      return null
    }

    return {
      id: existing.id,
      scope: { type: 'project', id: existing.id },
      identitySource: existing.identitySource as EnsuredProject['identitySource'],
      identityValue: existing.identityValue,
      repoRoot: inspected.repoRoot,
      created: false,
    }
  }

  assertProjectExists(projectId: string): void {
    if (!this.getById(projectId)) {
      throw new AppError(
        'INVALID_SCOPE',
        'Unknown project scope id. Run `hippo project ensure` first to register the current project.',
      )
    }
  }

  private upsertProjectPath({
    projectId,
    canonicalPath,
    now,
  }: {
    projectId: string
    canonicalPath: string
    now: string
  }): void {
    this.drizzleDb
      .insert(projectPathsTable)
      .values({
        projectId,
        canonicalPath,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: projectPathsTable.canonicalPath,
        set: {
          projectId,
          updatedAt: now,
        },
      })
      .run()
  }
}
