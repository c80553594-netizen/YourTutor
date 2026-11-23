import { createTutorDatabase, type TutorDatabase } from '../database.js';
import { type SqlDriver } from '../driver.js';
import { type MigrationRunResult, runMigrations } from '../migrations/index.js';
import { CourseRepository } from './courses.repository.js';
import { ExamItemRepository } from './exam-items.repository.js';
import { LessonRepository } from './lessons.repository.js';
import { MasteryRepository } from './mastery.repository.js';
import { MessageRepository } from './messages.repository.js';
import { PracticeAttemptRepository } from './practice-attempts.repository.js';
import { ProviderConfigRepository } from './provider-configs.repository.js';

export * from './courses.repository.js';
export * from './exam-items.repository.js';
export * from './lessons.repository.js';
export * from './messages.repository.js';
export * from './mastery.repository.js';
export * from './practice-attempts.repository.js';
export * from './provider-configs.repository.js';

export interface TutorStorage {
  readonly driver: SqlDriver;
  readonly db: TutorDatabase;
  readonly migrations: MigrationRunResult;
  readonly courses: CourseRepository;
  readonly examItems: ExamItemRepository;
  readonly lessons: LessonRepository;
  readonly messages: MessageRepository;
  readonly mastery: MasteryRepository;
  readonly practiceAttempts: PracticeAttemptRepository;
  readonly providerConfigs: ProviderConfigRepository;
  close(): Promise<void>;
}

/**
 * Bootstraps YourTutor local persistence: executes pending incremental SQLite migrations
 * and returns typed Drizzle repositories for all 7 tables.
 */
export async function createStorage(driver: SqlDriver): Promise<TutorStorage> {
  const migrations = await runMigrations(driver);
  const db = createTutorDatabase(driver);

  return {
    driver,
    db,
    migrations,
    courses: new CourseRepository(db),
    examItems: new ExamItemRepository(db),
    lessons: new LessonRepository(db, driver),
    messages: new MessageRepository(db),
    mastery: new MasteryRepository(db, driver),
    practiceAttempts: new PracticeAttemptRepository(db),
    providerConfigs: new ProviderConfigRepository(db, driver),
    close: () => driver.close(),
  };
}
