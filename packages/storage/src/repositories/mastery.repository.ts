import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  type ErrorTag,
  type MasteryRecordModel,
  type MasteryRecordUpdateProjection,
  type MasteryStatus,
} from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { type SqlDriver } from '../driver.js';
import { masteryRecordsTable } from '../schema.js';

export interface UpsertMasteryInput {
  id?: string;
  courseId: string;
  knowledgePoint: string;
  score: number;
  status: MasteryStatus;
  errorTags?: ErrorTag[];
  pitfallMemo?: string | null;
  reviewCount?: number;
  lastReviewedLessonIndex?: number | null;
  updatedAt?: number;
}

function parseErrorTags(raw: string): ErrorTag[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ErrorTag[]) : [];
  } catch {
    return [];
  }
}

function mapMasteryRow(row: typeof masteryRecordsTable.$inferSelect): MasteryRecordModel {
  return {
    id: row.id,
    courseId: row.courseId,
    knowledgePoint: row.knowledgePoint,
    score: row.score,
    status: row.status as MasteryStatus,
    errorTags: parseErrorTags(row.errorTagsJson),
    pitfallMemo: row.pitfallMemo,
    reviewCount: row.reviewCount,
    lastReviewedLessonIndex: row.lastReviewedLessonIndex,
    updatedAt: row.updatedAt,
  };
}

export class MasteryRepository {
  constructor(
    private readonly db: TutorDatabase,
    private readonly driver: SqlDriver
  ) {}

  async findByKnowledgePoint(
    courseId: string,
    knowledgePoint: string
  ): Promise<MasteryRecordModel | null> {
    const row = await this.db
      .select()
      .from(masteryRecordsTable)
      .where(
        and(
          eq(masteryRecordsTable.courseId, courseId),
          eq(masteryRecordsTable.knowledgePoint, knowledgePoint)
        )
      )
      .get();
    return row ? mapMasteryRow(row) : null;
  }

  async upsert(input: UpsertMasteryInput): Promise<MasteryRecordModel> {
    const clampedScore = Math.max(0, Math.min(100, Math.round(input.score)));
    const updatedAt = input.updatedAt ?? Date.now();
    const existing = await this.findByKnowledgePoint(input.courseId, input.knowledgePoint);

    if (existing) {
      await this.db
        .update(masteryRecordsTable)
        .set({
          score: clampedScore,
          status: input.status,
          errorTagsJson: JSON.stringify(input.errorTags ?? existing.errorTags),
          pitfallMemo:
            input.pitfallMemo !== undefined ? input.pitfallMemo : (existing.pitfallMemo ?? null),
          reviewCount: input.reviewCount ?? existing.reviewCount,
          lastReviewedLessonIndex:
            input.lastReviewedLessonIndex !== undefined
              ? input.lastReviewedLessonIndex
              : (existing.lastReviewedLessonIndex ?? null),
          updatedAt,
        })
        .where(eq(masteryRecordsTable.id, existing.id));
    } else {
      await this.db.insert(masteryRecordsTable).values({
        id: input.id ?? crypto.randomUUID(),
        courseId: input.courseId,
        knowledgePoint: input.knowledgePoint,
        score: clampedScore,
        status: input.status,
        errorTagsJson: JSON.stringify(input.errorTags ?? []),
        pitfallMemo: input.pitfallMemo ?? null,
        reviewCount: input.reviewCount ?? 0,
        lastReviewedLessonIndex: input.lastReviewedLessonIndex ?? null,
        updatedAt,
      });
    }

    const saved = await this.findByKnowledgePoint(input.courseId, input.knowledgePoint);
    if (!saved) {
      throw new Error(`Failed to reload mastery record for '${input.knowledgePoint}'.`);
    }
    return saved;
  }

  /**
   * Atomically persists mastery update projections produced by GradingAndDrillService.
   */
  async applyProjections(
    courseId: string,
    projections: MasteryRecordUpdateProjection[]
  ): Promise<MasteryRecordModel[]> {
    const results: MasteryRecordModel[] = [];
    await this.driver.transaction(async () => {
      for (const proj of projections) {
        const saved = await this.upsert({
          courseId,
          knowledgePoint: proj.knowledgePoint,
          score: proj.newScore,
          status: proj.status,
          errorTags: proj.errorTags,
          pitfallMemo: proj.pitfallMemo,
          reviewCount: proj.reviewCount,
          lastReviewedLessonIndex: proj.lastReviewedLessonIndex,
          updatedAt: proj.updatedAt,
        });
        results.push(saved);
      }
    });
    return results;
  }

  async listByCourse(courseId: string): Promise<MasteryRecordModel[]> {
    const rows = await this.db
      .select()
      .from(masteryRecordsTable)
      .where(eq(masteryRecordsTable.courseId, courseId))
      .orderBy(asc(masteryRecordsTable.score), asc(masteryRecordsTable.knowledgePoint))
      .all();
    return rows.map(mapMasteryRow);
  }

  async listWeakOrConsolidating(courseId: string): Promise<MasteryRecordModel[]> {
    const rows = await this.db
      .select()
      .from(masteryRecordsTable)
      .where(
        and(
          eq(masteryRecordsTable.courseId, courseId),
          inArray(masteryRecordsTable.status, ['weak', 'consolidating'])
        )
      )
      .orderBy(asc(masteryRecordsTable.score))
      .all();
    return rows.map(mapMasteryRow);
  }
}
