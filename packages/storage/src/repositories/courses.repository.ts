import { desc, eq } from 'drizzle-orm';
import { type CourseModel, type DetailLevel, type TeachingStyle } from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { coursesTable } from '../schema.js';

export interface CreateCourseInput {
  id?: string;
  title: string;
  examType: string;
  targetScore?: string | null;
  prepTime?: string | null;
  teachingStyle?: TeachingStyle;
  customStylePrompt?: string | null;
  detailLevel?: DetailLevel;
  packId?: string;
  now?: number;
}

export interface UpdateCourseInput {
  title?: string;
  examType?: string;
  targetScore?: string | null;
  prepTime?: string | null;
  teachingStyle?: TeachingStyle;
  customStylePrompt?: string | null;
  detailLevel?: DetailLevel;
  packId?: string;
  now?: number;
}

function mapCourseRow(row: typeof coursesTable.$inferSelect): CourseModel {
  return {
    id: row.id,
    title: row.title,
    examType: row.examType,
    targetScore: row.targetScore,
    prepTime: row.prepTime,
    teachingStyle: row.teachingStyle as TeachingStyle,
    customStylePrompt: row.customStylePrompt,
    detailLevel: row.detailLevel as DetailLevel,
    packId: row.packId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CourseRepository {
  constructor(private readonly db: TutorDatabase) {}

  async create(input: CreateCourseInput): Promise<CourseModel> {
    const now = input.now ?? Date.now();
    const id = input.id ?? crypto.randomUUID();
    const record: typeof coursesTable.$inferInsert = {
      id,
      title: input.title,
      examType: input.examType,
      targetScore: input.targetScore ?? null,
      prepTime: input.prepTime ?? null,
      teachingStyle: input.teachingStyle ?? 'coach',
      customStylePrompt: input.customStylePrompt ?? null,
      detailLevel: input.detailLevel ?? 'standard',
      packId: input.packId ?? 'general-exam',
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(coursesTable).values(record);
    return mapCourseRow({
      ...record,
      targetScore: record.targetScore ?? null,
      prepTime: record.prepTime ?? null,
      teachingStyle: record.teachingStyle ?? 'coach',
      customStylePrompt: record.customStylePrompt ?? null,
      detailLevel: record.detailLevel ?? 'standard',
      packId: record.packId ?? 'general-exam',
    });
  }

  async findById(id: string): Promise<CourseModel | null> {
    const row = await this.db.select().from(coursesTable).where(eq(coursesTable.id, id)).get();
    return row ? mapCourseRow(row) : null;
  }

  async listAll(): Promise<CourseModel[]> {
    const rows = await this.db
      .select()
      .from(coursesTable)
      .orderBy(desc(coursesTable.updatedAt))
      .all();
    return rows.map(mapCourseRow);
  }

  async update(id: string, patch: UpdateCourseInput): Promise<CourseModel | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updatedAt = patch.now ?? Date.now();
    await this.db
      .update(coursesTable)
      .set({
        title: patch.title ?? existing.title,
        examType: patch.examType ?? existing.examType,
        targetScore: patch.targetScore !== undefined ? patch.targetScore : existing.targetScore,
        prepTime: patch.prepTime !== undefined ? patch.prepTime : existing.prepTime,
        teachingStyle: patch.teachingStyle ?? existing.teachingStyle,
        customStylePrompt:
          patch.customStylePrompt !== undefined
            ? patch.customStylePrompt
            : existing.customStylePrompt,
        detailLevel: patch.detailLevel ?? existing.detailLevel,
        packId: patch.packId ?? existing.packId,
        updatedAt,
      })
      .where(eq(coursesTable.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }
    await this.db.delete(coursesTable).where(eq(coursesTable.id, id));
    return true;
  }
}
