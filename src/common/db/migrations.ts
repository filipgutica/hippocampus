import type Database from 'better-sqlite3'

type Migration = {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_memory_schema',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        statement TEXT NOT NULL,
        details TEXT,
        confidence REAL NOT NULL,
        reinforcement_count INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        memory_id TEXT,
        event_type TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        source_json TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memories(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_scope_kind_subject
        ON memories(scope_type, scope_id, kind, subject_key);

      CREATE INDEX IF NOT EXISTS idx_memories_scope_kind
        ON memories(scope_type, scope_id, kind);

      CREATE INDEX IF NOT EXISTS idx_memory_events_memory_created_at
        ON memory_events(memory_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_events_scope_created_at
        ON memory_events(scope_type, scope_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'memory_soft_delete',
    up: `
      ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE memories ADD COLUMN deleted_at TEXT;

      DROP INDEX IF EXISTS idx_memories_scope_kind_subject;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_active_scope_kind_subject
        ON memories(scope_type, scope_id, kind, subject_key)
        WHERE status = 'active';

      DROP INDEX IF EXISTS idx_memories_scope_kind;
      CREATE INDEX IF NOT EXISTS idx_memories_status_scope_kind
        ON memories(status, scope_type, scope_id, kind);
    `,
  },
  {
    version: 3,
    name: 'memory_classification_and_supersession',
    up: `
      ALTER TABLE memories ADD COLUMN source_type TEXT NOT NULL DEFAULT 'explicit_user_statement';
      ALTER TABLE memories ADD COLUMN superseded_by TEXT REFERENCES memories(id);

      DROP INDEX IF EXISTS idx_memories_active_scope_kind_subject;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_live_scope_kind_subject
        ON memories(scope_type, scope_id, kind, subject_key)
        WHERE status IN ('candidate', 'active');

      CREATE INDEX IF NOT EXISTS idx_memories_superseded_by
        ON memories(superseded_by);
    `,
  },
  {
    version: 4,
    name: 'memory_runtime_state',
    up: `
      CREATE TABLE IF NOT EXISTS memory_runtime_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        last_auto_archive_sweep_at TEXT
      );

      INSERT OR IGNORE INTO memory_runtime_state (singleton, last_auto_archive_sweep_at)
      VALUES (1, NULL);
    `,
  },
  {
    version: 5,
    name: 'memory_live_last_observed_index',
    up: `
      CREATE INDEX IF NOT EXISTS idx_memories_live_last_observed_created
        ON memories(status, last_observed_at, created_at)
        WHERE status IN ('candidate', 'active');
    `,
  },
]

export const runMigrations = (db: InstanceType<typeof Database>): void => {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);')

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>).map(
      row => row.version,
    ),
  )

  const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }

    db.transaction(() => {
      db.exec(migration.up)
      insertMigration.run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
