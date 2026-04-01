import type Database from 'better-sqlite3'

type Migration = {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'current_memory_schema',
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
        memory_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        statement TEXT NOT NULL,
        details TEXT,
        origin TEXT NOT NULL,
        reinforcement_count INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        last_reinforced_at TEXT NOT NULL,
        retrieval_count INTEGER NOT NULL DEFAULT 0,
        last_retrieved_at TEXT,
        strength REAL NOT NULL DEFAULT 1.0,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT REFERENCES memories(id),
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        memory_id TEXT,
        event_type TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        source_json TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES memories(id)
      );

      CREATE TABLE IF NOT EXISTS memory_runtime_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        last_auto_archive_sweep_at TEXT
      );

      INSERT OR IGNORE INTO memory_runtime_state (singleton, last_auto_archive_sweep_at)
      VALUES (1, NULL);

      CREATE TABLE IF NOT EXISTS memory_embeddings (
        memory_id TEXT PRIMARY KEY REFERENCES memories(id),
        model_id TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        source_text_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        model_fingerprint TEXT NOT NULL DEFAULT ''
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_live_scope_memory_type_subject
        ON memories(scope_type, scope_id, memory_type, subject_key)
        WHERE status IN ('candidate', 'active');

      CREATE INDEX IF NOT EXISTS idx_memories_status_scope_memory_type
        ON memories(status, scope_type, scope_id, memory_type);

      CREATE INDEX IF NOT EXISTS idx_memories_superseded_by
        ON memories(superseded_by);

      CREATE INDEX IF NOT EXISTS idx_memories_live_last_reinforced_created
        ON memories(status, last_reinforced_at, created_at)
        WHERE status IN ('candidate', 'active');

      CREATE INDEX IF NOT EXISTS idx_memory_events_memory_created_at
        ON memory_events(memory_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_events_scope_created_at
        ON memory_events(scope_type, scope_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_model_updated
        ON memory_embeddings(model_id, updated_at DESC);
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
