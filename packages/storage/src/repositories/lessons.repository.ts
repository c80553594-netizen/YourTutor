import { and, asc, eq, ne } from 'drizzle-orm';
import {
  type LessonDifficulty,
  type LessonMicroStage,
  type LessonModel,
  type LessonStatus,
} from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { type SqlDriver } from '../driver.js';
import { lessonsTable } from '../schema.js';

export interface CreateLessonInput {
  id?: string;
  courseId: string;
  orderIndex: number;
  title: string;
  knowledgePoints: string[];
  examItemIds?: string[];
  objective: string;
  difficulty: LessonDifficulty;
  estimatedMinutes: number;
  status?: LessonStatus;
  stage?: LessonMicroStage;
  now?: number;
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function mapLessonRow(row: typeof lessonsTable.$inferSelect): LessonModel {
  return {
    id: row.id,
    courseId: row.courseId,
    orderIndex: row.orderIndex,
    title: row.title,
    knowledgePoints: safeParseStringArray(row.knowledgePointsJson),
    examItemIds: safeParseStringArray(row.examItemIdsJson),
    objective: row.objective,
    difficulty: row.difficulty as LessonDifficulty,
    estimatedMinutes: row.estimatedMinutes,
    status: row.status as LessonStatus,
    stage: row.stage as LessonMicroStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class LessonRepository {
  constructor(
    private readonly db: TutorDatabase,
    private readonly driver: SqlDriver
  ) {}

  async createMany(inputs: CreateLessonInput[]): Promise<LessonModel[]> {
    if (inputs.length === 0) {
      return [];
    }
    const createdIds: string[] = [];
    await this.driver.transaction(async () => {
      for (const input of inputs) {
        const now = input.now ?? Date.now();
        const id = input.id ?? crypto.randomUUID();
        createdIds.push(id);
        await this.db.insert(lessonsTable).values({
          id,
          courseId: input.courseId,
          orderIndex: input.orderIndex,
          title: input.title,
          knowledgePointsJson: JSON.stringify(input.knowledgePoints),
          examItemIdsJson: JSON.stringify(input.examItemIds ?? []),
          objective: input.objective,
          difficulty: input.difficulty,
          estimatedMinutes: input.estimatedMinutes,
          status: input.status ?? (input.orderIndex === 1 ? 'active' : 'locked'),
          stage: input.stage ?? 'anchor',
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const firstCourseId = inputs[0]?.courseId;
    if (!firstCourseId) {
      return [];
    }
    const all = await this.listByCourse(firstCourseId);
    const idSet = new Set(createdIds);
    return all.filter((l) => idSet.has(l.id));
  }

  async findById(id: string): Promise<LessonModel | null> {
    const row = await this.db.select().from(lessonsTable).where(eq(lessonsTable.id, id)).get();
    return row ? mapLessonRow(row) : null;
  }

  async listByCourse(courseId: string): Promise<LessonModel[]> {
    const rows = await this.db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .orderBy(asc(lessonsTable.orderIndex))
      .all();
    return rows.map(mapLessonRow);
  }

  async updateStatus(
    id: string,
    status: LessonStatus,
    stage?: LessonMicroStage,
    now = Date.now()
  ): Promise<LessonModel | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }
    await this.db
      .update(lessonsTable)
      .set({
        status,
        stage: stage ?? existing.stage,
        updatedAt: now,
      })
      .where(eq(lessonsTable.id, id));
    return this.findById(id);
  }

  /**
   * Marks the given lesson as `mastered` and automatically unlocks the next locked lesson in order.
   */
  async completeAndUnlockNext(
    lessonId: string,
    now = Date.now()
  ): Promise<{ completed: LessonModel | null; unlocked: LessonModel | null }> {
    const current = await this.findById(lessonId);
    if (!current) {
      return { completed: null, unlocked: null };
    }

    let unlockedId: string | null = null;
    await this.driver.transaction(async () => {
      await this.db
        .update(lessonsTable)
        .set({ status: 'mastered', stage: 'completed', updatedAt: now })
        .where(eq(lessonsTable.id, lessonId));

      const courseLessons = await this.listByCourse(current.courseId);
      const next = courseLessons.find(
        (l) => l.orderIndex > current.orderIndex && l.status === 'locked'
      );
      if (next) {
        unlockedId = next.id;
        await this.db
          .update(lessonsTable)
          .set({ status: 'active', updatedAt: now })
          .where(eq(lessonsTable.id, next.id));
      }
    });

    const completed = await this.findById(lessonId);
    const unlocked = unlockedId ? await this.findById(unlockedId) : null;
    return { completed, unlocked };
  }

  /**
   * Atomically replaces all non-mastered lessons for a course (used after adaptive replanning).
   */
  async replaceRemainingLessons(
    courseId: string,
    newRemaining: CreateLessonInput[],
    now = Date.now()
  ): Promise<LessonModel[]> {
    await this.driver.transaction(async () => {
      await this.db
        .delete(lessonsTable)
        .where(and(eq(lessonsTable.courseId, courseId), ne(lessonsTable.status, 'mastered')));

      for (let i = 0; i < newRemaining.length; i++) {
        const input = newRemaining[i];
        if (!input) continue;
        const id = input.id ?? crypto.randomUUID();
        await this.db.insert(lessonsTable).values({
          id,
          courseId,
          orderIndex: input.orderIndex,
          title: input.title,
          knowledgePointsJson: JSON.stringify(input.knowledgePoints),
          examItemIdsJson: JSON.stringify(input.examItemIds ?? []),
          objective: input.objective,
          difficulty: input.difficulty,
          estimatedMinutes: input.estimatedMinutes,
          status: input.status ?? (i === 0 ? 'active' : 'locked'),
          stage: input.stage ?? 'anchor',
          createdAt: input.now ?? now,
          updatedAt: input.now ?? now,
        });
      }
    });

    return this.listByCourse(courseId);
  }
}
