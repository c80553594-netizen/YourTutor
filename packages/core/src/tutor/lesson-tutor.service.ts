import {
  type ExamItemModel,
  type LessonMessageModel,
  type LessonModel,
  type MasteryRecordModel,
  type TeachingConfig,
} from '../domain/types.js';
import { generalExamPromptPack } from '../packs/general-exam/index.js';
import { type PromptPack } from '../packs/types.js';
import {
  type ChatMessage,
  type ProviderStreamEvent,
  type TutorProvider,
} from '../providers/types.js';

export interface LessonTurnInput {
  courseTitle: string;
  examType: string;
  lesson: LessonModel;
  totalLessons: number;
  teachingConfig: TeachingConfig;
  masteryRecords: MasteryRecordModel[];
  relatedExamItems: ExamItemModel[];
  /** Historical messages within the current lesson (persisted in local DB). */
  history: LessonMessageModel[];
  /** Current student message, or omitted when starting the lesson's opening lecture + quiz. */
  userInput?: string;
  provider: TutorProvider;
  model?: string;
  pack?: PromptPack;
  signal?: AbortSignal;
}

/**
 * Determines which previously weak/consolidating knowledge points should be interleaved
 * for spaced-repetition anti-forgetting review (every 2 lessons per docs/tutor-prompt.md).
 */
export function selectSpacedReviewPoints(
  lessonOrderIndex: number,
  currentLessonKnowledgePoints: string[],
  masteryRecords: MasteryRecordModel[],
  maxPoints = 1
): MasteryRecordModel[] {
  // Trigger spaced review starting from lesson 3 and every 2 lessons (lesson 3, 5, 7, ...)
  // or whenever a weak/consolidating point hasn't been reviewed for >= 2 lessons.
  if (lessonOrderIndex < 3) {
    return [];
  }

  const currentSet = new Set(currentLessonKnowledgePoints);
  const candidates = masteryRecords.filter((rec) => {
    if (currentSet.has(rec.knowledgePoint)) {
      return false;
    }
    if (rec.status !== 'weak' && rec.status !== 'consolidating') {
      return false;
    }
    const lastIdx = rec.lastReviewedLessonIndex ?? 0;
    return lessonOrderIndex - lastIdx >= 2;
  });

  // Prioritize lowest score first (weakest points first)
  candidates.sort((a, b) => a.score - b.score || a.updatedAt - b.updatedAt);
  return candidates.slice(0, maxPoints);
}

/**
 * Stage 3 Service: Progressive Single-Lesson Tutor.
 *
 * Stateless with respect to LLM vendor: dynamically injects current lesson anchor,
 * live TeachingStyle (5 presets + custom), live DetailLevel (3 tiers), latest Mastery Profile,
 * and spaced-repetition reminders on every turn so learners can hot-swap models/subscriptions
 * mid-course without losing pedagogical state.
 */
export class LessonTutorService {
  private readonly defaultPack: PromptPack;

  constructor(defaultPack: PromptPack = generalExamPromptPack) {
    this.defaultPack = defaultPack;
  }

  buildLessonSystemPrompt(
    input: Omit<LessonTurnInput, 'provider' | 'history' | 'userInput'>
  ): string {
    const pack = input.pack ?? this.defaultPack;
    const spacedReviewPoints = selectSpacedReviewPoints(
      input.lesson.orderIndex,
      input.lesson.knowledgePoints,
      input.masteryRecords
    );

    return pack.buildLessonSystemPrompt({
      courseTitle: input.courseTitle,
      examType: input.examType,
      lesson: input.lesson,
      totalLessons: input.totalLessons,
      teachingConfig: input.teachingConfig,
      masteryRecords: input.masteryRecords,
      relatedExamItems: input.relatedExamItems,
      spacedReviewPoints,
    });
  }

  buildChatMessages(history: LessonMessageModel[], userInput?: string): ChatMessage[] {
    const messages: ChatMessage[] = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (userInput?.trim()) {
      messages.push({ role: 'user', content: userInput.trim() });
    } else if (messages.length === 0) {
      messages.push({
        role: 'user',
        content:
          '请开始本课时的渐进式精讲：依次输出「1.本课锚点 → 2.核心精讲 → 3.原题实战映射 → 4.随堂诊断小测」，出完小测题后立即停顿等待我作答，不要提前给答案，也不要剧透后续课时。',
      });
    }

    return messages;
  }

  streamLessonTurn(input: LessonTurnInput): AsyncIterable<ProviderStreamEvent> {
    const systemPrompt = this.buildLessonSystemPrompt({
      courseTitle: input.courseTitle,
      examType: input.examType,
      lesson: input.lesson,
      totalLessons: input.totalLessons,
      teachingConfig: input.teachingConfig,
      masteryRecords: input.masteryRecords,
      relatedExamItems: input.relatedExamItems,
      model: input.model,
      pack: input.pack,
      signal: input.signal,
    });

    const messages = this.buildChatMessages(input.history, input.userInput);

    return input.provider.streamChat({
      systemPrompt,
      messages,
      model: input.model,
      signal: input.signal,
    });
  }
}
