import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 1. courses: Exam/course projects with real-time teaching style, detail level, and prompt pack.
 */
export const coursesTable = sqliteTable('courses', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  examType: text('exam_type').notNull(),
  targetScore: text('target_score'),
  prepTime: text('prep_time'),
  teachingStyle: text('teaching_style').notNull().default('coach'),
  customStylePrompt: text('custom_style_prompt'),
  detailLevel: text('detail_level').notNull().default('standard'),
  packId: text('pack_id').notNull().default('general-exam'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * 2. exam_items: Imported exam questions with image attachment paths and reverse-engineering JSON.
 */
export const examItemsTable = sqliteTable(
  'exam_items',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    rawText: text('raw_text').notNull(),
    imagePathsJson: text('image_paths_json').notNull().default('[]'),
    analysisJson: text('analysis_json'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_exam_items_course_id').on(table.courseId)]
);

/**
 * 3. lessons: Auto-generated progressive syllabus lessons (`locked | active | mastered`).
 */
export const lessonsTable = sqliteTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    title: text('title').notNull(),
    knowledgePointsJson: text('knowledge_points_json').notNull().default('[]'),
    examItemIdsJson: text('exam_item_ids_json').notNull().default('[]'),
    objective: text('objective').notNull(),
    difficulty: text('difficulty').notNull(),
    estimatedMinutes: integer('estimated_minutes').notNull().default(15),
    status: text('status').notNull().default('locked'),
    stage: text('stage').notNull().default('anchor'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_lessons_course_order').on(table.courseId, table.orderIndex)]
);

/**
 * 4. messages: Per-lesson conversation stream with card types (`lecture | quiz | feedback | drill`).
 */
export const messagesTable = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessonsTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    cardType: text('card_type').notNull().default('lecture'),
    metadataJson: text('metadata_json'),
    providerId: text('provider_id'),
    model: text('model'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_messages_lesson_created').on(table.lessonId, table.createdAt)]
);

/**
 * 5. mastery_records: Structured knowledge-point mastery profile with error tags & pitfall memos.
 */
export const masteryRecordsTable = sqliteTable(
  'mastery_records',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    knowledgePoint: text('knowledge_point').notNull(),
    score: integer('score').notNull().default(0),
    status: text('status').notNull().default('unlearned'),
    errorTagsJson: text('error_tags_json').notNull().default('[]'),
    pitfallMemo: text('pitfall_memo'),
    reviewCount: integer('review_count').notNull().default(0),
    lastReviewedLessonIndex: integer('last_reviewed_lesson_index'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uidx_mastery_course_kp').on(table.courseId, table.knowledgePoint),
    index('idx_mastery_course_status').on(table.courseId, table.status),
  ]
);

/**
 * 6. practice_attempts: In-lesson quizzes & targeted drill attempts with rubric scores & diagnostics.
 */
export const practiceAttemptsTable = sqliteTable(
  'practice_attempts',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').references(() => lessonsTable.id, { onDelete: 'set null' }),
    knowledgePoint: text('knowledge_point').notNull(),
    questionStem: text('question_stem').notNull(),
    scoringPointsJson: text('scoring_points_json').notNull().default('[]'),
    studentAnswer: text('student_answer').notNull(),
    score: integer('score').notNull(),
    maxScore: integer('max_score').notNull().default(100),
    diagnosis: text('diagnosis').notNull(),
    errorTagsJson: text('error_tags_json').notNull().default('[]'),
    modelSolution: text('model_solution'),
    drillType: text('drill_type').notNull().default('quiz'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_practice_course_kp').on(table.courseId, table.knowledgePoint)]
);

/**
 * 7. provider_configs: Model provider configurations & encrypted keychain/keystore secret references.
 * Plaintext API keys or pairing tokens MUST NEVER be stored in this table.
 */
export const providerConfigsTable = sqliteTable('provider_configs', {
  id: text('id').primaryKey(),
  providerType: text('provider_type').notNull(),
  displayName: text('display_name').notNull(),
  enabled: integer('enabled').notNull().default(1),
  configJson: text('config_json').notNull().default('{}'),
  secretRef: text('secret_ref'),
  isDefault: integer('is_default').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const schema = {
  courses: coursesTable,
  examItems: examItemsTable,
  lessons: lessonsTable,
  messages: messagesTable,
  masteryRecords: masteryRecordsTable,
  practiceAttempts: practiceAttemptsTable,
  providerConfigs: providerConfigsTable,
};

export type TutorSchema = typeof schema;
