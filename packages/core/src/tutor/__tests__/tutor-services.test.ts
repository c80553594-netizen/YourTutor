import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import {
  type ExamItemModel,
  type LessonModel,
  type MasteryRecordModel,
  type ReverseEngineeringAnalysis,
} from '../../domain/types.js';
import { runStructuredWithRepair } from '../../providers/structured-output.js';
import {
  type ChatRequest,
  type ModelInfo,
  type ProviderCapabilities,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from '../../providers/types.js';
import { CurriculumPlannerService } from '../curriculum-planner.service.js';
import {
  computeUpdatedMasteryRecords,
  GradingAndDrillService,
  selectDrillStrategy,
} from '../grading-and-drill.service.js';
import { LessonTutorService, selectSpacedReviewPoints } from '../lesson-tutor.service.js';
import { ReverseEngineerService } from '../reverse-engineer.service.js';

function createMockTutorProvider(
  id: string,
  responder: (req: ChatRequest) => string,
  supportsVision = true
): { provider: TutorProvider; capturedRequests: ChatRequest[] } {
  const capturedRequests: ChatRequest[] = [];
  const capabilities: ProviderCapabilities = {
    runtime: 'universal-api',
    supportsVision,
    supportsThinking: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsModelListing: true,
  };

  const provider: TutorProvider = {
    id,
    name: `Mock ${id}`,
    capabilities,
    async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
      capturedRequests.push(request);
      yield { type: 'text_delta', text: responder(request) };
      yield { type: 'done', finishReason: 'stop' };
    },
    async generateStructured<TSchema extends z.ZodTypeAny>(
      request: StructuredRequest<TSchema>
    ): Promise<StructuredResult<z.infer<TSchema>>> {
      return runStructuredWithRepair(this, request);
    },
    async healthCheck(): Promise<ProviderHealthResult> {
      return { providerId: id, ok: true, latencyMs: 1, message: 'ok' };
    },
    async listModels(): Promise<ModelInfo[]> {
      return [];
    },
  };

  return { provider, capturedRequests };
}

const SAMPLE_ANALYSIS: ReverseEngineeringAnalysis = {
  examSummary: '函数导数与单调区间含参分类讨论压轴题',
  knowledgePoints: [
    {
      name: '导数求单调区间',
      weight: 'high_frequency',
      description: '利用导数符号判断原函数单调性',
    },
    {
      name: '含参分类讨论',
      weight: 'differentiator',
      description: '按参数临界值划分定义域与导数零点位置',
    },
  ],
  prerequisiteChain: [
    {
      id: 'p1',
      concept: '基本初等函数求导公式',
      level: 'foundation',
      dependsOn: [],
      reason: '求导计算错误会直接导致后续全错',
    },
    {
      id: 'p2',
      concept: '二次不等式与定义域交集',
      level: 'core',
      dependsOn: ['p1', 'dangling-nonexistent-id'],
      reason: '判断导数正负区间必须先限定定义域',
    },
  ],
  examTraps: [
    {
      title: '忽略对数函数定义域 x > 0',
      hiddenCondition: '题干含 ln(x) 隐含 x > 0',
      commonMistake: '解导数零点时未舍去负数根',
      avoidanceTip: '见 ln 先写定义域 x > 0 占 1 分且防全盘皆错',
    },
  ],
  scoringRubric: [
    { step: '声明定义域', requirement: '写出 x > 0', weightPercent: 15, keyFormulaOrTerm: 'x > 0' },
    {
      step: '求导通分',
      requirement: "正确写出 f'(x) 分子因式分解",
      weightPercent: 35,
      keyFormulaOrTerm: "f'(x)",
    },
    { step: '分类讨论单调区间', requirement: '分情况给出开区间结论', weightPercent: 50 },
  ],
};

describe('Stage 1: ReverseEngineerService', () => {
  it('produces validated 4-dimensional analysis and strips dangling prerequisite IDs', async () => {
    const { provider } = createMockTutorProvider('mock-api', () => JSON.stringify(SAMPLE_ANALYSIS));
    const service = new ReverseEngineerService();

    const result = await service.analyze({
      examText: '已知 f(x) = a ln(x) - x^2 + 2x，讨论 f(x) 的单调性。',
      examType: '高考数学',
      provider,
    });

    expect(result.analysis.knowledgePoints).toHaveLength(2);
    // Dangling dependency ID should be normalized away
    expect(result.analysis.prerequisiteChain[1]?.dependsOn).toEqual(['p1']);
  });

  it('rejects image input when provider lacks vision capability', async () => {
    const { provider } = createMockTutorProvider('cli-no-vision', () => '{}', false);
    const service = new ReverseEngineerService();

    await expect(
      service.analyze({
        examText: '',
        images: [{ mimeType: 'image/jpeg', dataBase64: 'AAA=' }],
        provider,
      })
    ).rejects.toThrow(/does not support vision/i);
  });
});

describe('Stage 2: CurriculumPlannerService', () => {
  it('plans progressive lessons and replans remaining lessons while preserving mastered ones', async () => {
    let mode: 'initial' | 'replan' = 'initial';
    const { provider, capturedRequests } = createMockTutorProvider('planner-api', () => {
      if (mode === 'initial') {
        return JSON.stringify({
          overview: '由浅入深攻克含参导数单调性',
          lessons: [
            {
              orderIndex: 2,
              title: '含参分类讨论核心模型',
              knowledgePoints: ['含参分类讨论'],
              examItemIndices: [0],
              objective: '掌握临界值划分法',
              difficulty: 'intermediate',
              estimatedMinutes: 20,
              rationale: '核心提分模型',
            },
            {
              orderIndex: 1,
              title: '求导与定义域防坑基础',
              knowledgePoints: ['导数求单调区间'],
              examItemIndices: [0],
              objective: '零失误完成求导与定义域标注',
              difficulty: 'foundation',
              estimatedMinutes: 15,
              rationale: '前置依赖补齐',
            },
          ],
        });
      }
      return JSON.stringify({
        overview: '针对含参分类薄弱点强化重排',
        lessons: [
          {
            orderIndex: 1,
            title: '含参分类讨论避坑补强',
            knowledgePoints: ['含参分类讨论'],
            examItemIndices: [0],
            objective: '彻底打通参数临界点拆解',
            difficulty: 'intermediate',
            estimatedMinutes: 20,
            rationale: '针对薄弱点补强',
          },
          {
            orderIndex: 2,
            title: '原题满分演练与变式迁移',
            knowledgePoints: ['导数求单调区间', '含参分类讨论'],
            examItemIndices: [0],
            objective: '完整拿下压轴 12 分',
            difficulty: 'sprint',
            estimatedMinutes: 25,
            rationale: '原题实战与压轴迁移',
          },
        ],
      });
    });

    const planner = new CurriculumPlannerService();
    const initial = await planner.planCurriculum({
      examType: '高考数学',
      targetScore: '135/150',
      prepTime: '30天',
      examItems: [{ index: 0, rawText: 'f(x)=a ln x - x^2', analysis: SAMPLE_ANALYSIS }],
      provider,
    });

    // Sorted and normalized 1..N
    expect(initial.plan.lessons[0]?.title).toBe('求导与定义域防坑基础');
    expect(initial.plan.lessons[0]?.orderIndex).toBe(1);
    expect(initial.plan.lessons[1]?.orderIndex).toBe(2);

    // Replan after Lesson 1 is mastered
    mode = 'replan';
    const existingLessons: LessonModel[] = [
      {
        id: 'l1',
        courseId: 'c1',
        orderIndex: 1,
        title: '求导与定义域防坑基础',
        knowledgePoints: ['导数求单调区间'],
        examItemIds: ['e1'],
        objective: '零失误求导',
        difficulty: 'foundation',
        estimatedMinutes: 15,
        status: 'mastered',
        stage: 'completed',
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'l2',
        courseId: 'c1',
        orderIndex: 2,
        title: '原计划第2课',
        knowledgePoints: ['含参分类讨论'],
        examItemIds: ['e1'],
        objective: '分类讨论',
        difficulty: 'intermediate',
        estimatedMinutes: 20,
        status: 'active',
        stage: 'anchor',
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    const replanned = await planner.replanRemainingLessons({
      examType: '高考数学',
      examItems: [{ index: 0, rawText: 'f(x)=a ln x - x^2', analysis: SAMPLE_ANALYSIS }],
      existingLessons,
      masteryRecords: [
        {
          id: 'm1',
          courseId: 'c1',
          knowledgePoint: '含参分类讨论',
          score: 42,
          status: 'weak',
          errorTags: ['logic_break'],
          reviewCount: 1,
          updatedAt: 10,
        },
      ],
      provider,
    });

    expect(replanned.preservedCompletedLessons).toHaveLength(1);
    expect(replanned.remainingPlan.lessons[0]?.orderIndex).toBe(2);
    expect(replanned.remainingPlan.lessons[1]?.orderIndex).toBe(3);
    expect(capturedRequests[1]?.messages[0]?.content).toContain('含参分类讨论');
  });
});

describe('Stage 3: LessonTutorService (real-time config & mid-course provider switching)', () => {
  it('injects live teaching style, detail level, mastery profile, and spaced review triggers across provider switches', async () => {
    const lesson: LessonModel = {
      id: 'l3',
      courseId: 'c1',
      orderIndex: 3,
      title: '含参分类讨论压轴破解',
      knowledgePoints: ['含参分类讨论'],
      examItemIds: ['e1'],
      objective: '完整写出分类讨论采分点',
      difficulty: 'advanced',
      estimatedMinutes: 20,
      status: 'active',
      stage: 'anchor',
      createdAt: 1,
      updatedAt: 1,
    };

    const masteryRecords: MasteryRecordModel[] = [
      {
        id: 'm-old',
        courseId: 'c1',
        knowledgePoint: '对数定义域隐含条件',
        score: 55,
        status: 'weak',
        errorTags: ['trap_missed'],
        pitfallMemo: '见 ln 先写 x > 0',
        reviewCount: 1,
        lastReviewedLessonIndex: 1,
        updatedAt: 100,
      },
    ];

    const examItems: ExamItemModel[] = [
      {
        id: 'e1',
        courseId: 'c1',
        rawText: '讨论 f(x) = a ln(x) - x^2 单调性',
        imagePaths: [],
        orderIndex: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    // Spaced review triggers at lesson 3 because old weak point was last reviewed at lesson 1 (3 - 1 >= 2)
    const spaced = selectSpacedReviewPoints(3, lesson.knowledgePoints, masteryRecords);
    expect(spaced.map((s) => s.knowledgePoint)).toEqual(['对数定义域隐含条件']);

    const { provider: providerA, capturedRequests: reqsA } = createMockTutorProvider(
      'provider-a',
      () => '第一轮：本课锚点 + 精讲 + 随堂小测'
    );
    const { provider: providerB, capturedRequests: reqsB } = createMockTutorProvider(
      'provider-b',
      () => '切换模型后无缝续讲（幽默通俗类比 + 保姆级）'
    );

    const tutor = new LessonTutorService();

    // Turn 1 with Provider A (coach + concise)
    for await (const _ev of tutor.streamLessonTurn({
      courseTitle: '高考导数提分营',
      examType: '高考数学',
      lesson,
      totalLessons: 5,
      teachingConfig: { style: 'coach', detailLevel: 'concise' },
      masteryRecords,
      relatedExamItems: examItems,
      history: [],
      provider: providerA,
    })) {
      // consume stream
    }

    expect(reqsA[0]?.systemPrompt).toContain('A. 名师提分风');
    expect(reqsA[0]?.systemPrompt).toContain('1. 精简提分版');
    expect(reqsA[0]?.systemPrompt).toContain('【📊 学情掌握度档案】');
    expect(reqsA[0]?.systemPrompt).toContain('间隔抗遗忘复盘触发');
    expect(reqsA[0]?.systemPrompt).toContain('见 ln 先写 x > 0');

    // Turn 2 mid-course switch to Provider B + live switch to humorous + zero_base
    for await (const _ev of tutor.streamLessonTurn({
      courseTitle: '高考导数提分营',
      examType: '高考数学',
      lesson,
      totalLessons: 5,
      teachingConfig: { style: 'humorous', detailLevel: 'zero_base' },
      masteryRecords,
      relatedExamItems: examItems,
      history: [
        {
          id: 'msg1',
          courseId: 'c1',
          lessonId: 'l3',
          role: 'assistant',
          content: '第一轮：本课锚点 + 精讲 + 随堂小测',
          cardType: 'lecture',
          createdAt: 10,
        },
      ],
      userInput: '这一步分类讨论没太懂，能用生活例子讲细一点吗？',
      provider: providerB,
    })) {
      // consume stream
    }

    expect(reqsB[0]?.systemPrompt).toContain('D. 幽默通俗类比风');
    expect(reqsB[0]?.systemPrompt).toContain('3. 保姆级零基础版');
    expect(reqsB[0]?.systemPrompt).toContain('对数定义域隐含条件');
    expect(reqsB[0]?.messages).toHaveLength(2);
  });
});

describe('Stage 4: GradingAndDrillService', () => {
  it('enforces mastery gate, projects mastery deltas, and routes drill strategies by error tag', async () => {
    expect(
      selectDrillStrategy({
        id: '1',
        courseId: 'c1',
        knowledgePoint: 'A',
        score: 40,
        status: 'weak',
        errorTags: ['concept_gap'],
        reviewCount: 1,
        updatedAt: 1,
      })
    ).toBe('concept_check');

    expect(
      selectDrillStrategy({
        id: '2',
        courseId: 'c1',
        knowledgePoint: 'B',
        score: 65,
        status: 'consolidating',
        errorTags: ['logic_break'],
        reviewCount: 1,
        updatedAt: 1,
      })
    ).toBe('variant');

    expect(
      selectDrillStrategy({
        id: '3',
        courseId: 'c1',
        knowledgePoint: 'C',
        score: 70,
        status: 'consolidating',
        errorTags: ['trap_missed'],
        reviewCount: 1,
        updatedAt: 1,
      })
    ).toBe('trap_focus');

    expect(
      selectDrillStrategy({
        id: '4',
        courseId: 'c1',
        knowledgePoint: 'D',
        score: 90,
        status: 'mastered',
        errorTags: [],
        reviewCount: 2,
        updatedAt: 1,
      })
    ).toBe('synthesis');

    expect(selectDrillStrategy(undefined, { isSpacedReview: true })).toBe('spaced_review');

    // Verify mastery projection clamping and status derivation
    const updates = computeUpdatedMasteryRecords(
      [
        {
          id: 'm1',
          courseId: 'c1',
          knowledgePoint: '导数求单调区间',
          score: 70,
          status: 'consolidating',
          errorTags: ['trap_missed'],
          reviewCount: 1,
          updatedAt: 100,
        },
      ],
      [
        {
          knowledgePoint: '导数求单调区间',
          scoreDelta: 20,
          suggestedStatus: 'mastered',
          errorTags: [],
        },
      ],
      { lessonOrderIndex: 2, now: 200 }
    );

    expect(updates[0]).toMatchObject({
      knowledgePoint: '导数求单调区间',
      previousScore: 70,
      newScore: 90,
      status: 'mastered',
      errorTags: [],
      reviewCount: 2,
      lastReviewedLessonIndex: 2,
    });

    // End-to-end gradeSubmission gate enforcement (score 75 => must remediate even if model says passed=true)
    const { provider: gradeProvider } = createMockTutorProvider('grader', () =>
      JSON.stringify({
        score: 75,
        maxScore: 100,
        passed: true,
        correctParts: ['正确求导'],
        missedPoints: ['遗漏 x > 0 定义域'],
        errorTags: ['trap_missed'],
        diagnosis: '未先声明定义域导致负数区间误纳入',
        highScoreSolution: '第一步先写定义域 (0, +∞)...',
        pitfallMemo: '见 ln 先写 x > 0',
        masteryDeltas: [
          {
            knowledgePoint: '导数求单调区间',
            scoreDelta: 15,
            suggestedStatus: 'consolidating',
            errorTags: ['trap_missed'],
            pitfallMemo: '见 ln 先写 x > 0',
          },
        ],
        nextAction: 'advance_lesson',
      })
    );

    const service = new GradingAndDrillService();
    const graded = await service.gradeSubmission({
      courseId: 'c1',
      examType: '高考数学',
      lessonOrderIndex: 1,
      knowledgePoints: ['导数求单调区间'],
      questionStem: '求 f(x)=ln(x)-x 的单调区间',
      scoringPoints: ['声明 x>0', '求导 1/x - 1', '写出单调区间'],
      studentAnswer: "f'(x)=1/x-1, x<1递增, x>1递减",
      currentMasteryRecords: [],
      provider: gradeProvider,
    });

    expect(graded.grading.passed).toBe(false);
    expect(graded.grading.nextAction).toBe('remediate_and_retest');
    expect(graded.masteryUpdates[0]?.pitfallMemo).toBe('见 ln 先写 x > 0');

    // Targeted drill generation
    const { provider: drillProvider } = createMockTutorProvider('drill-gen', () =>
      JSON.stringify({
        drills: [
          {
            knowledgePoint: '导数求单调区间',
            strategy: 'trap_focus',
            stem: '已知 g(x)=ln(2x-1)-x，求单调区间（注意定义域）。',
            hints: ['先列 2x-1 > 0'],
            scoringPoints: ['写出定义域 x > 1/2', '正确求导', '写出单调区间'],
            referenceSolution: '定义域 x > 1/2 ...',
            trapWarning: '别忘写定义域左端点 1/2！',
          },
        ],
      })
    );

    const drills = await service.generateTargetedDrills({
      examType: '高考数学',
      count: 1,
      masteryRecords: [
        {
          id: 'm1',
          courseId: 'c1',
          knowledgePoint: '导数求单调区间',
          score: 55,
          status: 'weak',
          errorTags: ['trap_missed'],
          pitfallMemo: '见 ln 先写 x > 0',
          reviewCount: 1,
          updatedAt: 1,
        },
      ],
      provider: drillProvider,
    });

    expect(drills.selectedTargets).toEqual([
      { knowledgePoint: '导数求单调区间', strategy: 'trap_focus' },
    ]);
    expect(drills.drillSet.drills[0]?.strategy).toBe('trap_focus');
  });
});
