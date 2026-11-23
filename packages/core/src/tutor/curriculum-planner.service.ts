import {
  type CurriculumPlan,
  CurriculumPlanSchema,
  type LessonModel,
  type MasteryRecordModel,
  type ReverseEngineeringAnalysis,
} from '../domain/types.js';
import { generalExamPromptPack } from '../packs/general-exam/index.js';
import { type PromptPack } from '../packs/types.js';
import { type TokenUsage, type TutorProvider } from '../providers/types.js';

export interface AnalyzedExamItemInput {
  index: number;
  rawText: string;
  analysis: ReverseEngineeringAnalysis;
}

export interface PlanCurriculumInput {
  examType: string;
  targetScore?: string;
  prepTime?: string;
  examItems: AnalyzedExamItemInput[];
  provider: TutorProvider;
  model?: string;
  pack?: PromptPack;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
}

export interface ReplanCurriculumInput extends PlanCurriculumInput {
  existingLessons: LessonModel[];
  masteryRecords: MasteryRecordModel[];
}

export interface PlanCurriculumOutput {
  plan: CurriculumPlan;
  attempts: number;
  usage?: TokenUsage;
}

export interface ReplanCurriculumOutput {
  preservedCompletedLessons: LessonModel[];
  remainingPlan: CurriculumPlan;
  attempts: number;
  usage?: TokenUsage;
}

/**
 * Stage 2 Service: Auto-Curriculum Planner & Adaptive Replanner.
 * Generates progressive 3~8 lesson plans (foundation -> core -> original exam -> variants/traps)
 * and dynamically replans remaining unmastered lessons based on latest MasteryRecords.
 */
export class CurriculumPlannerService {
  private readonly defaultPack: PromptPack;

  constructor(defaultPack: PromptPack = generalExamPromptPack) {
    this.defaultPack = defaultPack;
  }

  async planCurriculum(input: PlanCurriculumInput): Promise<PlanCurriculumOutput> {
    if (input.examItems.length === 0) {
      throw new Error('At least one analyzed exam item is required to plan a curriculum.');
    }

    const pack = input.pack ?? this.defaultPack;
    const { systemPrompt, userPrompt } = pack.buildCurriculumPlanPrompt({
      examType: input.examType,
      targetScore: input.targetScore,
      prepTime: input.prepTime,
      examItems: input.examItems,
    });

    const result = await input.provider.generateStructured({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: input.model,
      schema: CurriculumPlanSchema,
      schemaName: 'CurriculumPlan',
      schemaDescription:
        'Progressive multi-lesson curriculum plan ordered from foundation to sprint',
      signal: input.signal,
      maxRepairAttempts: input.maxRepairAttempts ?? 2,
    });

    const normalizedLessons = [...result.data.lessons]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((lesson, idx) => ({
        ...lesson,
        orderIndex: idx + 1,
      }));

    return {
      plan: {
        overview: result.data.overview,
        lessons: normalizedLessons,
      },
      attempts: result.attempts,
      usage: result.usage,
    };
  }

  /**
   * Preserves all already-mastered lessons untouched and replans only remaining lessons
   * starting from `completedCount + 1`, prioritizing weak/consolidating knowledge points.
   */
  async replanRemainingLessons(input: ReplanCurriculumInput): Promise<ReplanCurriculumOutput> {
    const completed = [...input.existingLessons]
      .filter((l) => l.status === 'mastered')
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const pack = input.pack ?? this.defaultPack;
    const { systemPrompt, userPrompt } = pack.buildCurriculumReplanPrompt({
      examType: input.examType,
      targetScore: input.targetScore,
      prepTime: input.prepTime,
      examItems: input.examItems,
      existingCompletedLessons: completed,
      masteryRecords: input.masteryRecords,
    });

    const result = await input.provider.generateStructured({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: input.model,
      schema: CurriculumPlanSchema,
      schemaName: 'AdaptiveCurriculumReplan',
      schemaDescription: 'Replanned remaining lessons adapted to current mastery records',
      signal: input.signal,
      maxRepairAttempts: input.maxRepairAttempts ?? 2,
    });

    const startOrder = completed.length + 1;
    const normalizedRemaining = [...result.data.lessons]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((lesson, idx) => ({
        ...lesson,
        orderIndex: startOrder + idx,
      }));

    return {
      preservedCompletedLessons: completed,
      remainingPlan: {
        overview: result.data.overview,
        lessons: normalizedRemaining,
      },
      attempts: result.attempts,
      usage: result.usage,
    };
  }
}
