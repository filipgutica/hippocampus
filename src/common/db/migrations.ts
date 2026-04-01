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
  {
    version: 6,
    name: 'memory_embeddings',
    up: `
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        memory_id TEXT PRIMARY KEY REFERENCES memories(id),
        model_id TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        source_text_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_model_updated
        ON memory_embeddings(model_id, updated_at DESC);
    `,
  },
  {
    version: 7,
    name: 'memory_embeddings_model_fingerprint',
    up: `
      ALTER TABLE memory_embeddings ADD COLUMN model_fingerprint TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 8,
    name: 'memory_retrieval_strength_and_reinforcement_rename',
    up: `
      ALTER TABLE memories ADD COLUMN last_reinforced_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE memories ADD COLUMN retrieval_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE memories ADD COLUMN last_retrieved_at TEXT;
      ALTER TABLE memories ADD COLUMN strength REAL NOT NULL DEFAULT 1.0;

      UPDATE memories
      SET last_reinforced_at = last_observed_at
      WHERE last_reinforced_at = '';

      DROP INDEX IF EXISTS idx_memories_live_last_observed_created;
      CREATE INDEX IF NOT EXISTS idx_memories_live_last_reinforced_created
        ON memories(status, last_reinforced_at, created_at)
        WHERE status IN ('candidate', 'active');
    `,
  },
  {
    version: 9,
    name: 'memory_drop_confidence_copy_table',
    up: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE memories_new (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        statement TEXT NOT NULL,
        details TEXT,
        source_type TEXT NOT NULL DEFAULT 'explicit_user_statement',
        reinforcement_count INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        last_reinforced_at TEXT NOT NULL DEFAULT '',
        retrieval_count INTEGER NOT NULL DEFAULT 0,
        last_retrieved_at TEXT,
        strength REAL NOT NULL DEFAULT 1.0,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT REFERENCES memories(id),
        deleted_at TEXT
      );

      INSERT INTO memories_new (
        id, scope_type, scope_id, kind, subject, subject_key, statement, details,
        source_type, reinforcement_count, policy_version, created_at, updated_at,
        last_observed_at, last_reinforced_at, retrieval_count, last_retrieved_at, strength,
        status, superseded_by, deleted_at
      )
      SELECT
        id, scope_type, scope_id, kind, subject, subject_key, statement, details,
        source_type, reinforcement_count, policy_version, created_at, updated_at,
        last_observed_at, last_reinforced_at, retrieval_count, last_retrieved_at, strength,
        status, superseded_by, deleted_at
      FROM memories;

      DROP TABLE memories;
      ALTER TABLE memories_new RENAME TO memories;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_live_scope_kind_subject
        ON memories(scope_type, scope_id, kind, subject_key)
        WHERE status IN ('candidate', 'active');

      CREATE INDEX IF NOT EXISTS idx_memories_status_scope_kind
        ON memories(status, scope_type, scope_id, kind);

      CREATE INDEX IF NOT EXISTS idx_memories_superseded_by
        ON memories(superseded_by);

      CREATE INDEX IF NOT EXISTS idx_memories_live_last_reinforced_created
        ON memories(status, last_reinforced_at, created_at)
        WHERE status IN ('candidate', 'active');

      PRAGMA foreign_keys = ON;
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
