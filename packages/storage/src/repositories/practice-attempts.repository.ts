import { and, desc, eq } from 'drizzle-orm';
import { type DrillStrategy, type ErrorTag, type PracticeAttemptModel } from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { practiceAttemptsTable } from '../schema.js';

export interface CreatePracticeAttemptInput {
  id?: string;
  courseId: string;
  lessonId?: string | null;
  knowledgePoint: string;
  questionStem: string;
  scoringPoints: string[];
  studentAnswer: string;
  score: number;
  maxScore?: number;
  diagnosis: string;
  errorTags: ErrorTag[];
  modelSolution?: string | null;
  drillType?: 'quiz' | DrillStrategy;
  createdAt?: number;
}

function parseArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapPracticeRow(row: typeof practiceAttemptsTable.$inferSelect): PracticeAttemptModel {
  return {
    id: row.id,
    courseId: row.courseId,
    lessonId: row.lessonId,
    knowledgePoint: row.knowledgePoint,
    questionStem: row.questionStem,
    scoringPoints: parseArray<string>(row.scoringPointsJson),
    studentAnswer: row.studentAnswer,
    score: row.score,
    maxScore: row.maxScore,
    diagnosis: row.diagnosis,
    errorTags: parseArray<ErrorTag>(row.errorTagsJson),
    modelSolution: row.modelSolution,
    drillType: row.drillType as PracticeAttemptModel['drillType'],
    createdAt: row.createdAt,
  };
}

export class PracticeAttemptRepository {
  constructor(private readonly db: TutorDatabase) {}

  async create(input: CreatePracticeAttemptInput): Promise<PracticeAttemptModel> {
    const id = input.id ?? crypto.randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    await this.db.insert(practiceAttemptsTable).values({
      id,
      courseId: input.courseId,
      lessonId: input.lessonId ?? null,
      knowledgePoint: input.knowledgePoint,
      questionStem: input.questionStem,
      scoringPointsJson: JSON.stringify(input.scoringPoints),
      studentAnswer: input.studentAnswer,
      score: Math.round(input.score),
      maxScore: Math.round(input.maxScore ?? 100),
      diagnosis: input.diagnosis,
      errorTagsJson: JSON.stringify(input.errorTags),
      modelSolution: input.modelSolution ?? null,
      drillType: input.drillType ?? 'quiz',
      createdAt,
    });

    const row = await this.db
      .select()
      .from(practiceAttemptsTable)
      .where(eq(practiceAttemptsTable.id, id))
      .get();
    if (!row) {
      throw new Error(`Failed to reload practice attempt '${id}'.`);
    }
    return mapPracticeRow(row);
  }

  async listByCourse(courseId: string): Promise<PracticeAttemptModel[]> {
    const rows = await this.db
      .select()
      .from(practiceAttemptsTable)
      .where(eq(practiceAttemptsTable.courseId, courseId))
      .orderBy(desc(practiceAttemptsTable.createdAt))
      .all();
    return rows.map(mapPracticeRow);
  }

  async listByKnowledgePoint(
    courseId: string,
    knowledgePoint: string
  ): Promise<PracticeAttemptModel[]> {
    const rows = await this.db
      .select()
      .from(practiceAttemptsTable)
      .where(
        and(
          eq(practiceAttemptsTable.courseId, courseId),
          eq(practiceAttemptsTable.knowledgePoint, knowledgePoint)
        )
      )
      .orderBy(desc(practiceAttemptsTable.createdAt))
      .all();
    return rows.map(mapPracticeRow);
  }
}
