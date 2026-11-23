import { z } from 'zod';

/**
 * Teaching styles corresponding to docs/tutor-prompt.md (A~E + custom).
 */
export const TeachingStyleSchema = z.enum([
  'coach', // A. 名师提分风（默认）
  'gentle', // B. 温柔家教风
  'socratic', // C. 苏格拉底启发式
  'humorous', // D. 幽默通俗类比风
  'academic', // E. 严谨硬核学术风
  'custom', // 自定义讲课风格
]);
export type TeachingStyle = z.infer<typeof TeachingStyleSchema>;

/**
 * Teaching detail levels corresponding to docs/tutor-prompt.md (1~3).
 */
export const DetailLevelSchema = z.enum([
  'concise', // 1. 精简提分版
  'standard', // 2. 标准详尽版（默认）
  'zero_base', // 3. 保姆级零基础版
]);
export type DetailLevel = z.infer<typeof DetailLevelSchema>;

export const ExamWeightSchema = z.enum(['high_frequency', 'differentiator', 'foundation']);
export type ExamWeight = z.infer<typeof ExamWeightSchema>;

export const PrerequisiteLevelSchema = z.enum(['foundation', 'core', 'synthesis']);
export type PrerequisiteLevel = z.infer<typeof PrerequisiteLevelSchema>;

export const MasteryStatusSchema = z.enum(['unlearned', 'weak', 'consolidating', 'mastered']);
export type MasteryStatus = z.infer<typeof MasteryStatusSchema>;

export const ErrorTagSchema = z.enum([
  'concept_gap', // 概念盲区
  'logic_break', // 思路断层
  'trap_missed', // 审题踩坑
  'step_deduction', // 步骤丢分
]);
export type ErrorTag = z.infer<typeof ErrorTagSchema>;

export const LessonStatusSchema = z.enum(['locked', 'active', 'mastered']);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

export const LessonDifficultySchema = z.enum(['foundation', 'intermediate', 'advanced', 'sprint']);
export type LessonDifficulty = z.infer<typeof LessonDifficultySchema>;

export const LessonMicroStageSchema = z.enum([
  'anchor',
  'lecture',
  'mapping',
  'quiz',
  'grading',
  'completed',
]);
export type LessonMicroStage = z.infer<typeof LessonMicroStageSchema>;

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageCardTypeSchema = z.enum(['lecture', 'quiz', 'feedback', 'drill']);
export type MessageCardType = z.infer<typeof MessageCardTypeSchema>;

export const DrillStrategySchema = z.enum([
  'concept_check', // 基础概念辨析 / 分步填空
  'variant', // 同母题换壳变式
  'trap_focus', // 刻意埋坑防丢分专项
  'synthesis', // 跨考点综合压轴
  'spaced_review', // 间隔抗遗忘复盘
]);
export type DrillStrategy = z.infer<typeof DrillStrategySchema>;

/**
 * Stage 1: 4-Dimensional Reverse-Engineering Analysis Schema.
 */
export const KnowledgePointItemSchema = z.object({
  name: z.string().min(1),
  weight: ExamWeightSchema,
  description: z.string().min(1),
  examFrequencyHint: z.string().optional(),
});
export type KnowledgePointItem = z.infer<typeof KnowledgePointItemSchema>;

export const PrerequisiteNodeSchema = z.object({
  id: z.string().min(1),
  concept: z.string().min(1),
  level: PrerequisiteLevelSchema,
  dependsOn: z.array(z.string()).default([]),
  reason: z.string().min(1),
});
export type PrerequisiteNode = z.infer<typeof PrerequisiteNodeSchema>;

export const ExamTrapSchema = z.object({
  title: z.string().min(1),
  hiddenCondition: z.string().min(1),
  commonMistake: z.string().min(1),
  avoidanceTip: z.string().min(1),
});
export type ExamTrap = z.infer<typeof ExamTrapSchema>;

export const ScoringRubricItemSchema = z.object({
  step: z.string().min(1),
  requirement: z.string().min(1),
  weightPercent: z.number().min(0).max(100),
  keyFormulaOrTerm: z.string().optional(),
});
export type ScoringRubricItem = z.infer<typeof ScoringRubricItemSchema>;

export const ReverseEngineeringAnalysisSchema = z.object({
  examSummary: z.string().min(1),
  knowledgePoints: z.array(KnowledgePointItemSchema).min(1),
  prerequisiteChain: z.array(PrerequisiteNodeSchema).min(1),
  examTraps: z.array(ExamTrapSchema).min(1),
  scoringRubric: z.array(ScoringRubricItemSchema).min(1),
});
export type ReverseEngineeringAnalysis = z.infer<typeof ReverseEngineeringAnalysisSchema>;

/**
 * Stage 2: Progressive Auto-Curriculum Planning Schema.
 */
export const PlannedLessonSchema = z.object({
  orderIndex: z.number().int().min(1),
  title: z.string().min(1),
  knowledgePoints: z.array(z.string().min(1)).min(1),
  examItemIndices: z.array(z.number().int().min(0)).default([]),
  objective: z.string().min(1),
  difficulty: LessonDifficultySchema,
  estimatedMinutes: z.number().int().min(5).max(120),
  rationale: z.string().min(1),
});
export type PlannedLesson = z.infer<typeof PlannedLessonSchema>;

export const CurriculumPlanSchema = z.object({
  overview: z.string().min(1),
  lessons: z.array(PlannedLessonSchema).min(1).max(12),
});
export type CurriculumPlan = z.infer<typeof CurriculumPlanSchema>;

/**
 * Stage 3 & 4: Exam-Grader Feedback & Mastery Delta Schema.
 */
export const MasteryDeltaSchema = z.object({
  knowledgePoint: z.string().min(1),
  scoreDelta: z.number().int().min(-100).max(100),
  suggestedStatus: MasteryStatusSchema,
  errorTags: z.array(ErrorTagSchema).default([]),
  pitfallMemo: z.string().optional(),
});
export type MasteryDelta = z.infer<typeof MasteryDeltaSchema>;

export const GradingResultSchema = z.object({
  score: z.number().min(0).max(100),
  maxScore: z.number().positive().default(100),
  passed: z.boolean(),
  correctParts: z.array(z.string()).default([]),
  missedPoints: z.array(z.string()).default([]),
  errorTags: z.array(ErrorTagSchema).default([]),
  diagnosis: z.string().min(1),
  highScoreSolution: z.string().min(1),
  pitfallMemo: z.string().min(1),
  masteryDeltas: z.array(MasteryDeltaSchema).min(1),
  nextAction: z.enum(['advance_lesson', 'remediate_and_retest']),
});
export type GradingResult = z.infer<typeof GradingResultSchema>;

/**
 * Stage 4: Adaptive Targeted Drill Schema.
 */
export const GeneratedDrillItemSchema = z.object({
  knowledgePoint: z.string().min(1),
  strategy: DrillStrategySchema,
  stem: z.string().min(1),
  hints: z.array(z.string()).default([]),
  scoringPoints: z.array(z.string().min(1)).min(1),
  referenceSolution: z.string().min(1),
  trapWarning: z.string().min(1),
});
export type GeneratedDrillItem = z.infer<typeof GeneratedDrillItemSchema>;

export const GeneratedDrillSetSchema = z.object({
  drills: z.array(GeneratedDrillItemSchema).min(1).max(5),
});
export type GeneratedDrillSet = z.infer<typeof GeneratedDrillSetSchema>;

/**
 * Persistence-agnostic Domain Models shared across core, storage, and ui.
 */
export interface TeachingConfig {
  style: TeachingStyle;
  customStylePrompt?: string;
  detailLevel: DetailLevel;
}

export interface CourseModel {
  id: string;
  title: string;
  examType: string;
  targetScore?: string | null;
  prepTime?: string | null;
  teachingStyle: TeachingStyle;
  customStylePrompt?: string | null;
  detailLevel: DetailLevel;
  packId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExamItemModel {
  id: string;
  courseId: string;
  rawText: string;
  imagePaths: string[];
  analysis?: ReverseEngineeringAnalysis | null;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface LessonModel {
  id: string;
  courseId: string;
  orderIndex: number;
  title: string;
  knowledgePoints: string[];
  examItemIds: string[];
  objective: string;
  difficulty: LessonDifficulty;
  estimatedMinutes: number;
  status: LessonStatus;
  stage: LessonMicroStage;
  createdAt: number;
  updatedAt: number;
}

export interface LessonMessageModel {
  id: string;
  courseId: string;
  lessonId: string;
  role: MessageRole;
  content: string;
  cardType: MessageCardType;
  metadata?: Record<string, unknown> | null;
  providerId?: string | null;
  model?: string | null;
  createdAt: number;
}

export interface MasteryRecordModel {
  id: string;
  courseId: string;
  knowledgePoint: string;
  score: number;
  status: MasteryStatus;
  errorTags: ErrorTag[];
  pitfallMemo?: string | null;
  reviewCount: number;
  lastReviewedLessonIndex?: number | null;
  updatedAt: number;
}

export interface PracticeAttemptModel {
  id: string;
  courseId: string;
  lessonId?: string | null;
  knowledgePoint: string;
  questionStem: string;
  scoringPoints: string[];
  studentAnswer: string;
  score: number;
  maxScore: number;
  diagnosis: string;
  errorTags: ErrorTag[];
  modelSolution?: string | null;
  drillType: 'quiz' | DrillStrategy;
  createdAt: number;
}

export interface ProviderConfigModel {
  id: string;
  providerType: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** Reference to keychain/keystore encrypted secret (never plaintext). */
  secretRef?: string | null;
  isDefault: boolean;
  updatedAt: number;
}
