import {
  type DrillStrategy,
  type ErrorTag,
  type GeneratedDrillSet,
  GeneratedDrillSetSchema,
  type GradingResult,
  GradingResultSchema,
  type MasteryDelta,
  type MasteryRecordModel,
  type MasteryStatus,
} from '../domain/types.js';
import { generalExamPromptPack } from '../packs/general-exam/index.js';
import { type PromptPack } from '../packs/types.js';
import { type TokenUsage, type TutorProvider } from '../providers/types.js';

export interface GradeSubmissionInput {
  courseId: string;
  examType: string;
  lessonTitle?: string;
  lessonOrderIndex?: number;
  knowledgePoints: string[];
  questionStem: string;
  scoringPoints: string[];
  studentAnswer: string;
  currentMasteryRecords: MasteryRecordModel[];
  provider: TutorProvider;
  model?: string;
  pack?: PromptPack;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  now?: number;
}

export interface MasteryRecordUpdateProjection {
  knowledgePoint: string;
  previousScore: number;
  newScore: number;
  status: MasteryStatus;
  errorTags: ErrorTag[];
  pitfallMemo?: string | null;
  reviewCount: number;
  lastReviewedLessonIndex?: number | null;
  updatedAt: number;
}

export interface GradeSubmissionOutput {
  grading: GradingResult;
  masteryUpdates: MasteryRecordUpdateProjection[];
  attempts: number;
  usage?: TokenUsage;
}

export interface GenerateDrillsInput {
  examType: string;
  masteryRecords: MasteryRecordModel[];
  /** Optional explicit knowledge points chosen by the student; auto-selects weakest if omitted. */
  selectedKnowledgePoints?: string[];
  /** Optional explicit error tag filter. */
  focusErrorTag?: ErrorTag;
  /** Optional current lesson index to include spaced-repetition review items. */
  currentLessonOrderIndex?: number;
  /** Number of drills to generate (1~5, default 2). */
  count?: number;
  relatedExamTexts?: string[];
  provider: TutorProvider;
  model?: string;
  pack?: PromptPack;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
}

export interface GenerateDrillsOutput {
  drillSet: GeneratedDrillSet;
  selectedTargets: Array<{
    knowledgePoint: string;
    strategy: DrillStrategy;
  }>;
  attempts: number;
  usage?: TokenUsage;
}

/**
 * Maps numeric mastery score (0..100) to mastery status threshold.
 */
export function deriveMasteryStatus(score: number): MasteryStatus {
  if (score >= 80) {
    return 'mastered';
  }
  if (score >= 60) {
    return 'consolidating';
  }
  return 'weak';
}

/**
 * Deterministic targeted drill strategy selector grounded in docs/tutor-prompt.md Stage 4:
 * - concept_gap -> concept_check (拆解式基础辨析/分步填空)
 * - logic_break -> variant (同母题换壳变式)
 * - trap_missed / step_deduction -> trap_focus (刻意埋坑防丢分专项)
 * - mastered -> synthesis (跨考点综合压轴)
 * - spaced review trigger -> spaced_review (间隔抗遗忘复盘)
 */
export function selectDrillStrategy(
  record?: MasteryRecordModel,
  options?: { isSpacedReview?: boolean; focusErrorTag?: ErrorTag }
): DrillStrategy {
  if (options?.isSpacedReview) {
    return 'spaced_review';
  }

  const primaryTag = options?.focusErrorTag ?? record?.errorTags[0];

  if (primaryTag === 'concept_gap') {
    return 'concept_check';
  }
  if (primaryTag === 'logic_break') {
    return 'variant';
  }
  if (primaryTag === 'trap_missed' || primaryTag === 'step_deduction') {
    return 'trap_focus';
  }

  if (!record || record.status === 'unlearned' || record.status === 'weak') {
    return 'concept_check';
  }
  if (record.status === 'consolidating') {
    return 'variant';
  }
  return 'synthesis';
}

/**
 * Pure function projecting updated mastery records from grading deltas.
 * Clamps scores to [0, 100], reconciles mastery status, deduplicates error tags,
 * and retains pitfall memos for local persistence.
 */
export function computeUpdatedMasteryRecords(
  currentRecords: MasteryRecordModel[],
  deltas: MasteryDelta[],
  options: {
    fallbackPitfallMemo?: string;
    lessonOrderIndex?: number;
    now?: number;
  } = {}
): MasteryRecordUpdateProjection[] {
  const now = options.now ?? Date.now();
  const byKnowledgePoint = new Map<string, MasteryRecordModel>();
  for (const rec of currentRecords) {
    byKnowledgePoint.set(rec.knowledgePoint, rec);
  }

  return deltas.map((delta) => {
    const existing = byKnowledgePoint.get(delta.knowledgePoint);
    const previousScore = existing ? existing.score : 0;
    const rawNewScore = previousScore + delta.scoreDelta;
    const newScore = Math.max(0, Math.min(100, Math.round(rawNewScore)));

    // Derive status from score, but respect stricter downgrade if suggestedStatus is weaker
    const derivedStatus = deriveMasteryStatus(newScore);
    const statusOrder: Record<MasteryStatus, number> = {
      unlearned: 0,
      weak: 1,
      consolidating: 2,
      mastered: 3,
    };
    const finalStatus =
      delta.suggestedStatus !== 'unlearned' &&
      statusOrder[delta.suggestedStatus] < statusOrder[derivedStatus]
        ? delta.suggestedStatus
        : derivedStatus;

    // If mastered with zero new error tags, clear old resolved error tags; otherwise merge unique tags
    const mergedTags: ErrorTag[] =
      finalStatus === 'mastered' && delta.errorTags.length === 0
        ? []
        : Array.from(new Set([...(existing?.errorTags ?? []), ...delta.errorTags]));

    const pitfallMemo =
      delta.pitfallMemo?.trim() ||
      (delta.errorTags.length > 0 ? options.fallbackPitfallMemo?.trim() : undefined) ||
      existing?.pitfallMemo ||
      null;

    return {
      knowledgePoint: delta.knowledgePoint,
      previousScore,
      newScore,
      status: finalStatus,
      errorTags: mergedTags,
      pitfallMemo,
      reviewCount: (existing?.reviewCount ?? 0) + 1,
      lastReviewedLessonIndex:
        options.lessonOrderIndex ?? existing?.lastReviewedLessonIndex ?? null,
      updatedAt: now,
    };
  });
}

/**
 * Stage 3/4 Service: Exam-Grader Scoring, Mastery Projection & Adaptive Targeted Drill Generator.
 */
export class GradingAndDrillService {
  private readonly defaultPack: PromptPack;

  constructor(defaultPack: PromptPack = generalExamPromptPack) {
    this.defaultPack = defaultPack;
  }

  async gradeSubmission(input: GradeSubmissionInput): Promise<GradeSubmissionOutput> {
    const pack = input.pack ?? this.defaultPack;
    const { systemPrompt, userPrompt } = pack.buildGradingPrompt({
      examType: input.examType,
      lessonTitle: input.lessonTitle,
      knowledgePoints: input.knowledgePoints,
      questionStem: input.questionStem,
      scoringPoints: input.scoringPoints,
      studentAnswer: input.studentAnswer,
      currentMasteryRecords: input.currentMasteryRecords,
    });

    const result = await input.provider.generateStructured({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: input.model,
      schema: GradingResultSchema,
      schemaName: 'GradingResult',
      schemaDescription:
        'Exam-grader evaluation with score, error tags, high-score solution, and masteryDeltas',
      signal: input.signal,
      maxRepairAttempts: input.maxRepairAttempts ?? 2,
    });

    // Enforce mastery gate invariant: cannot advance if score < 80 or concept_gap remains
    const normalizedPassed =
      result.data.score >= 80 && !result.data.errorTags.includes('concept_gap');
    const normalizedGrading: GradingResult = {
      ...result.data,
      passed: normalizedPassed,
      nextAction: normalizedPassed ? 'advance_lesson' : 'remediate_and_retest',
    };

    const masteryUpdates = computeUpdatedMasteryRecords(
      input.currentMasteryRecords,
      normalizedGrading.masteryDeltas,
      {
        fallbackPitfallMemo: normalizedGrading.pitfallMemo,
        lessonOrderIndex: input.lessonOrderIndex,
        now: input.now,
      }
    );

    return {
      grading: normalizedGrading,
      masteryUpdates,
      attempts: result.attempts,
      usage: result.usage,
    };
  }

  async generateTargetedDrills(input: GenerateDrillsInput): Promise<GenerateDrillsOutput> {
    const count = Math.max(1, Math.min(5, input.count ?? 2));
    const recordMap = new Map<string, MasteryRecordModel>();
    for (const rec of input.masteryRecords) {
      recordMap.set(rec.knowledgePoint, rec);
    }

    const targets: Array<{
      knowledgePoint: string;
      strategy: DrillStrategy;
      record?: MasteryRecordModel;
    }> = [];

    if (input.selectedKnowledgePoints && input.selectedKnowledgePoints.length > 0) {
      for (const kp of input.selectedKnowledgePoints.slice(0, count)) {
        const rec = recordMap.get(kp);
        targets.push({
          knowledgePoint: kp,
          strategy: selectDrillStrategy(rec, { focusErrorTag: input.focusErrorTag }),
          record: rec,
        });
      }
    } else {
      // Auto-select weakest knowledge points first
      const sorted = [...input.masteryRecords].sort((a, b) => a.score - b.score);
      for (const rec of sorted) {
        if (targets.length >= count) {
          break;
        }
        const isSpaced =
          input.currentLessonOrderIndex !== undefined &&
          rec.lastReviewedLessonIndex !== undefined &&
          rec.lastReviewedLessonIndex !== null &&
          input.currentLessonOrderIndex - rec.lastReviewedLessonIndex >= 2 &&
          (rec.status === 'weak' || rec.status === 'consolidating');

        targets.push({
          knowledgePoint: rec.knowledgePoint,
          strategy: selectDrillStrategy(rec, {
            isSpacedReview: isSpaced,
            focusErrorTag: input.focusErrorTag,
          }),
          record: rec,
        });
      }
    }

    if (targets.length === 0) {
      throw new Error('No knowledge points available to generate targeted drills.');
    }

    const pack = input.pack ?? this.defaultPack;
    const { systemPrompt, userPrompt } = pack.buildDrillPrompt({
      examType: input.examType,
      targets,
      relatedExamTexts: input.relatedExamTexts,
      count,
    });

    const result = await input.provider.generateStructured({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: input.model,
      schema: GeneratedDrillSetSchema,
      schemaName: 'GeneratedDrillSet',
      schemaDescription: 'Targeted high-score exam practice drills adapted to mastery profile',
      signal: input.signal,
      maxRepairAttempts: input.maxRepairAttempts ?? 2,
    });

    return {
      drillSet: result.data,
      selectedTargets: targets.map((t) => ({
        knowledgePoint: t.knowledgePoint,
        strategy: t.strategy,
      })),
      attempts: result.attempts,
      usage: result.usage,
    };
  }
}
