import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { createDrizzleDb } from '../common/db/drizzle.js'
import { memoryRuntimeStateTable } from '../common/db/schema/index.js'

export class MemoryRuntimeStateRepository {
  private readonly drizzleDb

  constructor(db: InstanceType<typeof Database>) {
    this.drizzleDb = createDrizzleDb(db)
  }

  getLastAutoArchiveSweepAt(): string | null {
    const row = this.drizzleDb
      .select({
        lastAutoArchiveSweepAt: memoryRuntimeStateTable.lastAutoArchiveSweepAt,
      })
      .from(memoryRuntimeStateTable)
      .where(eq(memoryRuntimeStateTable.singleton, 1))
      .get()

    return row?.lastAutoArchiveSweepAt ?? null
  }

  setLastAutoArchiveSweepAt(at: string): void {
    this.drizzleDb
      .update(memoryRuntimeStateTable)
      .set({ lastAutoArchiveSweepAt: at })
      .where(eq(memoryRuntimeStateTable.singleton, 1))
      .run()
  }
}
