import { asc, eq } from 'drizzle-orm';
import { type ExamItemModel, type ReverseEngineeringAnalysis } from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { examItemsTable } from '../schema.js';

export interface CreateExamItemInput {
  id?: string;
  courseId: string;
  rawText: string;
  imagePaths?: string[];
  analysis?: ReverseEngineeringAnalysis | null;
  orderIndex?: number;
  now?: number;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapExamItemRow(row: typeof examItemsTable.$inferSelect): ExamItemModel {
  return {
    id: row.id,
    courseId: row.courseId,
    rawText: row.rawText,
    imagePaths: safeParseJson<string[]>(row.imagePathsJson, []),
    analysis: safeParseJson<ReverseEngineeringAnalysis | null>(row.analysisJson, null),
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ExamItemRepository {
  constructor(private readonly db: TutorDatabase) {}

  async create(input: CreateExamItemInput): Promise<ExamItemModel> {
    const now = input.now ?? Date.now();
    const id = input.id ?? crypto.randomUUID();
    const row: typeof examItemsTable.$inferInsert = {
      id,
      courseId: input.courseId,
      rawText: input.rawText,
      imagePathsJson: JSON.stringify(input.imagePaths ?? []),
      analysisJson: input.analysis ? JSON.stringify(input.analysis) : null,
      orderIndex: input.orderIndex ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(examItemsTable).values(row);
    const created = await this.findById(id);
    if (!created) {
      throw new Error(`Failed to reload created exam item '${id}'.`);
    }
    return created;
  }

  async findById(id: string): Promise<ExamItemModel | null> {
    const row = await this.db.select().from(examItemsTable).where(eq(examItemsTable.id, id)).get();
    return row ? mapExamItemRow(row) : null;
  }

  async listByCourse(courseId: string): Promise<ExamItemModel[]> {
    const rows = await this.db
      .select()
      .from(examItemsTable)
      .where(eq(examItemsTable.courseId, courseId))
      .orderBy(asc(examItemsTable.orderIndex), asc(examItemsTable.createdAt))
      .all();
    return rows.map(mapExamItemRow);
  }

  async saveAnalysis(
    id: string,
    analysis: ReverseEngineeringAnalysis,
    now = Date.now()
  ): Promise<ExamItemModel | null> {
    await this.db
      .update(examItemsTable)
      .set({
        analysisJson: JSON.stringify(analysis),
        updatedAt: now,
      })
      .where(eq(examItemsTable.id, id));
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(examItemsTable).where(eq(examItemsTable.id, id));
  }
}
