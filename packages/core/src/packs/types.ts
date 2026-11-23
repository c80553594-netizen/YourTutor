import {
  type DetailLevel,
  type DrillStrategy,
  type ExamItemModel,
  type LessonModel,
  type MasteryRecordModel,
  type ReverseEngineeringAnalysis,
  type TeachingConfig,
  type TeachingStyle,
} from '../domain/types.js';

export interface ReverseEngineerPromptContext {
  examText: string;
  examType?: string;
  hasImages?: boolean;
}

export interface CurriculumPlanPromptContext {
  examType: string;
  targetScore?: string;
  prepTime?: string;
  examItems: Array<{ index: number; rawText: string; analysis: ReverseEngineeringAnalysis }>;
  existingCompletedLessons?: LessonModel[];
  masteryRecords?: MasteryRecordModel[];
}

export interface LessonTutorPromptContext {
  courseTitle: string;
  examType: string;
  lesson: LessonModel;
  totalLessons: number;
  teachingConfig: TeachingConfig;
  masteryRecords: MasteryRecordModel[];
  relatedExamItems: ExamItemModel[];
  spacedReviewPoints?: MasteryRecordModel[];
}

export interface GradingPromptContext {
  examType: string;
  lessonTitle?: string;
  knowledgePoints: string[];
  questionStem: string;
  scoringPoints: string[];
  studentAnswer: string;
  currentMasteryRecords: MasteryRecordModel[];
}

export interface DrillPromptContext {
  examType: string;
  targets: Array<{
    knowledgePoint: string;
    strategy: DrillStrategy;
    record?: MasteryRecordModel;
  }>;
  relatedExamTexts?: string[];
  count: number;
}

/**
 * Extensible subject prompt pack interface.
 * New exam disciplines (e.g. Gaokao Math, Kaoyan, IELTS, CPA) are added by implementing
 * PromptPack and registering it in PromptPackRegistry.
 */
export interface PromptPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly supportedLanguages: string[];
  readonly version: string;

  describeStyle(style: TeachingStyle, customPrompt?: string): string;
  describeDetailLevel(level: DetailLevel): string;
  formatMasteryProfile(
    records: MasteryRecordModel[],
    config: TeachingConfig,
    lessonIndex: number,
    totalLessons: number
  ): string;

  buildReverseEngineerPrompt(ctx: ReverseEngineerPromptContext): {
    systemPrompt: string;
    userPrompt: string;
  };

  buildCurriculumPlanPrompt(ctx: CurriculumPlanPromptContext): {
    systemPrompt: string;
    userPrompt: string;
  };

  buildCurriculumReplanPrompt(ctx: CurriculumPlanPromptContext): {
    systemPrompt: string;
    userPrompt: string;
  };

  buildLessonSystemPrompt(ctx: LessonTutorPromptContext): string;

  buildGradingPrompt(ctx: GradingPromptContext): {
    systemPrompt: string;
    userPrompt: string;
  };

  buildDrillPrompt(ctx: DrillPromptContext): {
    systemPrompt: string;
    userPrompt: string;
  };
}

export class PromptPackRegistry {
  private readonly packs = new Map<string, PromptPack>();
  private defaultPackId: string | null = null;

  register(pack: PromptPack, options?: { setAsDefault?: boolean }): void {
    this.packs.set(pack.id, pack);
    if (options?.setAsDefault || this.defaultPackId === null) {
      this.defaultPackId = pack.id;
    }
  }

  get(packId: string): PromptPack | undefined {
    return this.packs.get(packId);
  }

  getOrThrow(packId: string): PromptPack {
    const pack = this.packs.get(packId);
    if (!pack) {
      throw new Error(`PromptPack '${packId}' is not registered.`);
    }
    return pack;
  }

  getDefault(): PromptPack {
    if (!this.defaultPackId) {
      throw new Error('No PromptPack registered.');
    }
    return this.getOrThrow(this.defaultPackId);
  }

  list(): PromptPack[] {
    return Array.from(this.packs.values());
  }
}
