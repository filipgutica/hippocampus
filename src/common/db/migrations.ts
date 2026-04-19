import type Database from 'better-sqlite3'

type Migration = {
  version: number
  name: string
  up: string
}

const assertFts5Available = (db: InstanceType<typeof Database>): void => {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE temp.fts5_probe USING fts5(content);
      DROP TABLE temp.fts5_probe;
    `)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    throw new Error(`SQLite FTS5 is required for memory search indexing. ${message}`)
  }
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

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        identity_source TEXT NOT NULL,
        identity_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(identity_source, identity_value)
      );

      CREATE TABLE IF NOT EXISTS project_paths (
        project_id TEXT NOT NULL REFERENCES projects(id),
        canonical_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, canonical_path)
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        project_id TEXT REFERENCES projects(id),
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
        deleted_at TEXT,
        CHECK (
          (scope_type = 'project' AND project_id IS NOT NULL AND scope_id = project_id)
          OR (scope_type = 'user' AND project_id IS NULL)
        )
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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_live_project_scope_memory_type_subject
        ON memories(user_id, project_id, memory_type, subject_key)
        WHERE status IN ('candidate', 'active') AND project_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_live_nonproject_scope_memory_type_subject
        ON memories(user_id, scope_type, scope_id, memory_type, subject_key)
        WHERE status IN ('candidate', 'active') AND project_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_memories_status_project_memory_type
        ON memories(status, user_id, project_id, memory_type)
        WHERE project_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_memories_status_nonproject_scope_memory_type
        ON memories(status, user_id, scope_type, scope_id, memory_type)
        WHERE project_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_memories_superseded_by
        ON memories(superseded_by);

      CREATE INDEX IF NOT EXISTS idx_memories_live_last_reinforced_created
        ON memories(status, last_reinforced_at, created_at)
        WHERE status IN ('candidate', 'active');

      CREATE INDEX IF NOT EXISTS idx_memory_events_memory_created_at
        ON memory_events(memory_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_events_scope_created_at
        ON memory_events(scope_type, scope_id, created_at DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
      USING fts5(
        subject,
        statement,
        details,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS memories_fts_ai
      AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, subject, statement, details)
        VALUES (new.rowid, new.subject, new.statement, new.details);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_fts_ad
      AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, subject, statement, details)
        VALUES ('delete', old.rowid, old.subject, old.statement, old.details);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_fts_au
      AFTER UPDATE ON memories
      WHEN old.subject IS NOT new.subject
        OR old.statement IS NOT new.statement
        OR old.details IS NOT new.details
      BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, subject, statement, details)
        VALUES ('delete', old.rowid, old.subject, old.statement, old.details);
        INSERT INTO memories_fts(rowid, subject, statement, details)
        VALUES (new.rowid, new.subject, new.statement, new.details);
      END;

      INSERT INTO memories_fts(memories_fts) VALUES('rebuild');
    `,
  },
]

export const runMigrations = (db: InstanceType<typeof Database>): void => {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);')
  assertFts5Available(db)

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
