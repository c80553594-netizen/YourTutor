import { type SqlDriver } from '../driver.js';

export interface StorageMigration {
  id: string;
  name: string;
  upSql: string;
}

/**
 * Ordered incremental SQL migrations.
 * Future schema changes MUST append a new versioned migration here so existing users
 * upgrade seamlessly without losing courses, mastery history, or error logs.
 */
export const STORAGE_MIGRATIONS: StorageMigration[] = [
  {
    id: '0001_initial_schema',
    name: 'Create initial 7 YourTutor tables and indexes',
    upSql: `
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        target_score TEXT,
        prep_time TEXT,
        teaching_style TEXT NOT NULL DEFAULT 'coach',
        custom_style_prompt TEXT,
        detail_level TEXT NOT NULL DEFAULT 'standard',
        pack_id TEXT NOT NULL DEFAULT 'general-exam',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exam_items (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        raw_text TEXT NOT NULL,
        image_paths_json TEXT NOT NULL DEFAULT '[]',
        analysis_json TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_exam_items_course_id ON exam_items(course_id);

      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        knowledge_points_json TEXT NOT NULL DEFAULT '[]',
        exam_item_ids_json TEXT NOT NULL DEFAULT '[]',
        objective TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        estimated_minutes INTEGER NOT NULL DEFAULT 15,
        status TEXT NOT NULL DEFAULT 'locked',
        stage TEXT NOT NULL DEFAULT 'anchor',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lessons_course_order ON lessons(course_id, order_index);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        card_type TEXT NOT NULL DEFAULT 'lecture',
        metadata_json TEXT,
        provider_id TEXT,
        model TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_lesson_created ON messages(lesson_id, created_at);

      CREATE TABLE IF NOT EXISTS mastery_records (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        knowledge_point TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unlearned',
        error_tags_json TEXT NOT NULL DEFAULT '[]',
        pitfall_memo TEXT,
        review_count INTEGER NOT NULL DEFAULT 0,
        last_reviewed_lesson_index INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_mastery_course_kp ON mastery_records(course_id, knowledge_point);
      CREATE INDEX IF NOT EXISTS idx_mastery_course_status ON mastery_records(course_id, status);

      CREATE TABLE IF NOT EXISTS practice_attempts (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
        knowledge_point TEXT NOT NULL,
        question_stem TEXT NOT NULL,
        scoring_points_json TEXT NOT NULL DEFAULT '[]',
        student_answer TEXT NOT NULL,
        score INTEGER NOT NULL,
        max_score INTEGER NOT NULL DEFAULT 100,
        diagnosis TEXT NOT NULL,
        error_tags_json TEXT NOT NULL DEFAULT '[]',
        model_solution TEXT,
        drill_type TEXT NOT NULL DEFAULT 'quiz',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_practice_course_kp ON practice_attempts(course_id, knowledge_point);

      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY NOT NULL,
        provider_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL DEFAULT '{}',
        secret_ref TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

export interface MigrationRunResult {
  appliedIds: string[];
  skippedIds: string[];
}

/**
 * Automatically applies all pending migrations inside SQLite transactions.
 * Safe to call repeatedly on every application startup (idempotent).
 */
export async function runMigrations(
  driver: SqlDriver,
  migrations: StorageMigration[] = STORAGE_MIGRATIONS
): Promise<MigrationRunResult> {
  await driver.execScript(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS _yourtutor_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = await driver.queryObjects<{ id: string }>(
    'SELECT id FROM _yourtutor_migrations ORDER BY applied_at ASC'
  );
  const appliedSet = new Set(appliedRows.map((row) => row.id));

  const appliedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) {
      skippedIds.push(migration.id);
      continue;
    }

    await driver.transaction(async () => {
      await driver.execScript(migration.upSql);
      await driver.execute(
        'INSERT INTO _yourtutor_migrations (id, name, applied_at) VALUES (?, ?, ?)',
        [migration.id, migration.name, Date.now()]
      );
    });

    appliedIds.push(migration.id);
  }

  return { appliedIds, skippedIds };
}
