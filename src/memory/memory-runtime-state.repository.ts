import type Database from 'better-sqlite3'

type RuntimeStateRow = {
  last_auto_archive_sweep_at: string | null
}

export class MemoryRuntimeStateRepository {
  private readonly db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
  }

  getLastAutoArchiveSweepAt(): string | null {
    const row = this.db
      .prepare(
        `
          SELECT last_auto_archive_sweep_at
          FROM memory_runtime_state
          WHERE singleton = 1
          LIMIT 1
        `,
      )
      .get() as RuntimeStateRow | undefined

    return row?.last_auto_archive_sweep_at ?? null
  }

  setLastAutoArchiveSweepAt(at: string): void {
    this.db
      .prepare(
        `
          UPDATE memory_runtime_state
          SET last_auto_archive_sweep_at = ?
          WHERE singleton = 1
        `,
      )
      .run(at)
  }
}
