import { asc, eq } from 'drizzle-orm';
import { type LessonMessageModel, type MessageCardType, type MessageRole } from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { messagesTable } from '../schema.js';

export interface AppendMessageInput {
  id?: string;
  courseId: string;
  lessonId: string;
  role: MessageRole;
  content: string;
  cardType?: MessageCardType;
  metadata?: Record<string, unknown> | null;
  providerId?: string | null;
  model?: string | null;
  createdAt?: number;
}

function mapMessageRow(row: typeof messagesTable.$inferSelect): LessonMessageModel {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    courseId: row.courseId,
    lessonId: row.lessonId,
    role: row.role as MessageRole,
    content: row.content,
    cardType: row.cardType as MessageCardType,
    metadata,
    providerId: row.providerId,
    model: row.model,
    createdAt: row.createdAt,
  };
}

export class MessageRepository {
  constructor(private readonly db: TutorDatabase) {}

  async append(input: AppendMessageInput): Promise<LessonMessageModel> {
    const id = input.id ?? crypto.randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    await this.db.insert(messagesTable).values({
      id,
      courseId: input.courseId,
      lessonId: input.lessonId,
      role: input.role,
      content: input.content,
      cardType: input.cardType ?? 'lecture',
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      createdAt,
    });

    const row = await this.db.select().from(messagesTable).where(eq(messagesTable.id, id)).get();
    if (!row) {
      throw new Error(`Failed to reload appended message '${id}'.`);
    }
    return mapMessageRow(row);
  }

  async listByLesson(lessonId: string): Promise<LessonMessageModel[]> {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.lessonId, lessonId))
      .orderBy(asc(messagesTable.createdAt))
      .all();
    return rows.map(mapMessageRow);
  }

  async listByCourse(courseId: string): Promise<LessonMessageModel[]> {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.courseId, courseId))
      .orderBy(asc(messagesTable.createdAt))
      .all();
    return rows.map(mapMessageRow);
  }
}
