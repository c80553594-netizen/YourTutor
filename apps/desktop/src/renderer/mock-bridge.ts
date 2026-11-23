import {
  type CourseModel,
  type CurriculumPlan,
  type ExamItemModel,
  type GeneratedDrillSet,
  type GradingResult,
  type LessonMessageModel,
  type LessonModel,
  type MasteryRecordModel,
  type ModelInfo,
  type PracticeAttemptModel,
  type ProviderConfigModel,
  type ReverseEngineeringAnalysis,
} from '@yourtutor/core';
import {
  type AppBridge,
  type CompanionServerStatus,
  type ProviderSummary,
  type StreamSubscription,
} from '@yourtutor/ui';

/**
 * Rich in-memory MockAppBridge for `pnpm dev:web` cloud browser preview (Desktop & 390x844 Mobile).
 * Preloaded with realistic exam reverse-engineering data, KaTeX formulas, quizzes, and mastery records.
 */
export function createWebPreviewMockBridge(): AppBridge {
  const now = Date.now();
  const sampleCourseId = 'demo-course-gaokao-math';

  const courses: CourseModel[] = [
    {
      id: sampleCourseId,
      title: '高考数学 · 含参导数单调性高分突破',
      examType: '高考数学',
      targetScore: '135/150',
      prepTime: '14天冲刺',
      teachingStyle: 'coach',
      detailLevel: 'standard',
      packId: 'general-exam',
      createdAt: now - 3600_000,
      updatedAt: now - 60_000,
    },
  ];

  const sampleAnalysis: ReverseEngineeringAnalysis = {
    examSummary: '含参对数二次函数求导与单调区间分类讨论压轴模型',
    knowledgePoints: [
      {
        name: '对数函数隐含定义域',
        weight: 'foundation',
        description: '出现 ln(x) 必须首行声明定义域 x > 0，直接占 1 分并过滤负根',
      },
      {
        name: '导数通分与分子因式分解',
        weight: 'high_frequency',
        description: '将 f\'(x) 通分为分母恒正形式，聚焦分子二次函数根的分布',
      },
      {
        name: '含参临界值分类讨论',
        weight: 'differentiator',
        description: '按判别式与根是否在定义域 (0, +∞) 内分情况写出单调开区间',
      },
    ],
    prerequisiteChain: [
      {
        id: 'pre-1',
        concept: '基本初等函数求导与定义域优先原则',
        level: 'foundation',
        dependsOn: [],
        reason: '90% 的非智力丢分来自漏写定义域或求导符号错误',
      },
      {
        id: 'pre-2',
        concept: '含参二次不等式根的分布分析',
        level: 'core',
        dependsOn: ['pre-1'],
        reason: '判定导数正负区间的核心代数引擎',
      },
      {
        id: 'pre-3',
        concept: '压轴原题完整采分规范书写',
        level: 'synthesis',
        dependsOn: ['pre-2'],
        reason: '把思路转化为阅卷老师一眼给满分的标准步骤',
      },
    ],
    examTraps: [
      {
        title: '漏写定义域 x > 0 导致负数根误入单调区间',
        hiddenCondition: '式子中含 \\ln(x)，隐含定义域 (0, +\\infty)',
        commonMistake: '解出分子两个根后直接画全实数轴穿根',
        avoidanceTip: '【见 ln 先写 x > 0，画数轴先砍左半边】',
      },
      {
        title: '单调区间误用并集符号 ∪',
        hiddenCondition: '两个不连续单调增区间不能用 ∪ 连接',
        commonMistake: '写成 (0, 1) ∪ (2, +∞) 递增',
        avoidanceTip: '【不连续区间必须用“和”或逗号隔开，绝不写 ∪】',
      },
    ],
    scoringRubric: [
      { step: '声明定义域', requirement: '首行明确写明定义域 (0, +∞)', weightPercent: 15 },
      { step: '求导并通分', requirement: '写出 f\'(x) = (a - 2x^2 + 2x)/x', weightPercent: 30 },
      { step: '完整分类讨论', requirement: '按参数临界点无遗漏分情况给出结论', weightPercent: 55 },
    ],
  };

  const examItems: ExamItemModel[] = [
    {
      id: 'demo-exam-1',
      courseId: sampleCourseId,
      rawText: '已知函数 $f(x) = a\\ln x - x^2 + 2x$ ($a \\in \\mathbb{R}$)，讨论 $f(x)$ 的单调区间。',
      imagePaths: [],
      analysis: sampleAnalysis,
      orderIndex: 0,
      createdAt: now - 3500_000,
      updatedAt: now - 3500_000,
    },
  ];

  let lessons: LessonModel[] = [
    {
      id: 'demo-lesson-1',
      courseId: sampleCourseId,
      orderIndex: 1,
      title: '见 ln 先写定义域 + 导数通分零失误模板',
      knowledgePoints: ['对数函数隐含定义域', '导数通分与分子因式分解'],
      examItemIds: ['demo-exam-1'],
      objective: '稳拿前 45% 基础采分点，彻底消灭符号与定义域低级失误',
      difficulty: 'foundation',
      estimatedMinutes: 15,
      status: 'mastered',
      stage: 'completed',
      createdAt: now - 3000_000,
      updatedAt: now - 2000_000,
    },
    {
      id: 'demo-lesson-2',
      courseId: sampleCourseId,
      orderIndex: 2,
      title: '含参临界值分类讨论核心模型',
      knowledgePoints: ['含参临界值分类讨论'],
      examItemIds: ['demo-exam-1'],
      objective: '掌握“判别式 Δ + 根与 0 的大小比较”双轴分类法，攻克原题压轴 55% 分值',
      difficulty: 'intermediate',
      estimatedMinutes: 20,
      status: 'active',
      stage: 'quiz',
      createdAt: now - 3000_000,
      updatedAt: now - 1000_000,
    },
    {
      id: 'demo-lesson-3',
      courseId: sampleCourseId,
      orderIndex: 3,
      title: '原题满分规范演练与变式防坑压轴',
      knowledgePoints: ['导数通分与分子因式分解', '含参临界值分类讨论'],
      examItemIds: ['demo-exam-1'],
      objective: '在 8 分钟限时内写出零扣分的考场标准解答，并迁移到指数含参变式',
      difficulty: 'sprint',
      estimatedMinutes: 25,
      status: 'locked',
      stage: 'anchor',
      createdAt: now - 3000_000,
      updatedAt: now - 3000_000,
    },
  ];

  const messages: LessonMessageModel[] = [
    {
      id: 'demo-msg-1',
      courseId: sampleCourseId,
      lessonId: 'demo-lesson-2',
      role: 'assistant',
      cardType: 'lecture',
      providerId: 'antigravity-cli',
      model: 'gemini-2.5-pro',
      createdAt: now - 900_000,
      content: [
        '### 1. 本课锚点',
        '上一课我们已经稳稳拿下定义域和求导通分这 45% 的基本盘。本课直接攻克原题最容易失分的**含参临界值分类讨论**。',
        '',
        '### 2. 核心精讲',
        '对原题函数求导并通分后得到：',
        '$$f\'(x) = \\frac{a}{x} - 2x + 2 = \\frac{-2x^2 + 2x + a}{x} \\quad (x > 0)$$',
        '- 【🎯 考场触发词】分母 $x > 0$ 恒正 → 导数符号 **100% 由分子二次函数** $g(x) = -2x^2 + 2x + a$ 决定！',
        '- 【✅ 高分采分点】第一步算判别式 $\\Delta = 4 + 8a$，立刻锁定第一道分水岭 $a = -\\frac{1}{2}$；第二步利用韦达定理 $x_1 x_2 = -\\frac{a}{2}$ 判定正根个数，锁定第二道分水岭 $a = 0$。',
        '- 【⚠️ 易错深坑】当 $a > 0$ 时，$x_1 x_2 < 0$ 说明一正一负，**必须舍去负根**，只保留正根 $x_2 = \\frac{1 + \\sqrt{1 + 2a}}{2}$！',
        '',
        '| 参数范围 | 分子在 $(0,+\\infty)$ 的零点 | 递增区间 | 递减区间 |',
        '| --- | --- | --- | --- |',
        '| $a \\le -\\frac{1}{2}$ | 无变号零点 | 无 | $(0, +\\infty)$ |',
        '| $-\\frac{1}{2} < a < 0$ | 两个正根 $x_1 < x_2$ | $(x_1, x_2)$ | $(0, x_1)$，$(x_2, +\\infty)$ |',
        '| $a \\ge 0$ | 仅一个正根 $x_2$ | $(0, x_2)$ | $(x_2, +\\infty)$ |',
      ].join('\n'),
    },
    {
      id: 'demo-msg-2',
      courseId: sampleCourseId,
      lessonId: 'demo-lesson-2',
      role: 'assistant',
      cardType: 'quiz',
      providerId: 'antigravity-cli',
      model: 'gemini-2.5-pro',
      createdAt: now - 800_000,
      content: '随堂诊断小测',
      metadata: {
        knowledgePoints: ['含参临界值分类讨论'],
        questionStem:
          '**随堂诊断小测**：当 $a = 4$ 时，结合定义域求 $f(x) = 4\\ln x - x^2 + 2x$ 的单调递增与递减区间，并写出关键采分步骤。',
        scoringPoints: [
          '明确声明定义域 x > 0',
          '正确因式分解 -2x^2 + 2x + 4 = -2(x-2)(x+1) 并舍去负根 x = -1',
          '正确写出递增区间 (0, 2) 与递减区间 (2, +∞)',
        ],
      },
    },
  ];

  const masteryRecords: MasteryRecordModel[] = [
    {
      id: 'm-1',
      courseId: sampleCourseId,
      knowledgePoint: '对数函数隐含定义域',
      score: 92,
      status: 'mastered',
      errorTags: [],
      pitfallMemo: '见 ln 先写 x > 0，画数轴先砍左半边',
      reviewCount: 2,
      lastReviewedLessonIndex: 1,
      updatedAt: now - 1500_000,
    },
    {
      id: 'm-2',
      courseId: sampleCourseId,
      knowledgePoint: '导数通分与分子因式分解',
      score: 74,
      status: 'consolidating',
      errorTags: ['step_deduction'],
      pitfallMemo: '通分后务必显式写出“分母 x > 0”，否则阅卷扣步骤分',
      reviewCount: 1,
      lastReviewedLessonIndex: 1,
      updatedAt: now - 1400_000,
    },
    {
      id: 'm-3',
      courseId: sampleCourseId,
      knowledgePoint: '含参临界值分类讨论',
      score: 48,
      status: 'weak',
      errorTags: ['trap_missed', 'logic_break'],
      pitfallMemo: 'a > 0 时一正一负两根必须舍去负根',
      reviewCount: 1,
      lastReviewedLessonIndex: 2,
      updatedAt: now - 1200_000,
    },
  ];

  const practiceAttempts: PracticeAttemptModel[] = [];
  const providerConfigs: ProviderConfigModel[] = [];
  let companionStatus: CompanionServerStatus = { running: false };

  const providers: ProviderSummary[] = [
    {
      id: 'antigravity-cli',
      name: 'Antigravity CLI (Preview)',
      capabilities: {
        runtime: 'desktop-cli',
        supportsVision: false,
        supportsThinking: true,
        supportsStructuredOutput: true,
        supportsStreaming: true,
        supportsModelListing: true,
      },
      enabled: true,
      isDefault: true,
    },
    {
      id: 'gemini-api',
      name: 'Google Gemini API (Preview)',
      capabilities: {
        runtime: 'universal-api',
        supportsVision: true,
        supportsThinking: true,
        supportsStructuredOutput: true,
        supportsStreaming: true,
        supportsModelListing: true,
      },
      enabled: true,
      isDefault: false,
    },
    {
      id: 'openai-compatible',
      name: 'OpenAI / DeepSeek Compatible (Preview)',
      capabilities: {
        runtime: 'universal-api',
        supportsVision: true,
        supportsThinking: true,
        supportsStructuredOutput: true,
        supportsStreaming: true,
        supportsModelListing: true,
      },
      enabled: true,
      isDefault: false,
    },
  ];

  return {
    async getHostCapabilities() {
      return {
        platform: 'web-preview',
        supportsLocalCli: true,
        supportsCompanionServer: true,
        supportsCameraCapture: true,
        supportsClipboardImagePaste: true,
      };
    },
    async listCourses() {
      return [...courses];
    },
    async getCourse(courseId) {
      return courses.find((c) => c.id === courseId) ?? null;
    },
    async createCourse(input) {
      const created: CourseModel = {
        id: `course-${Date.now()}`,
        title: input.title,
        examType: input.examType,
        targetScore: input.targetScore ?? null,
        prepTime: input.prepTime ?? null,
        teachingStyle: input.teachingStyle ?? 'coach',
        customStylePrompt: input.customStylePrompt ?? null,
        detailLevel: input.detailLevel ?? 'standard',
        packId: input.packId ?? 'general-exam',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      courses.unshift(created);
      return created;
    },
    async updateCourseSettings(courseId, patch) {
      const idx = courses.findIndex((c) => c.id === courseId);
      if (idx === -1) throw new Error('Course not found');
      const updated = { ...courses[idx]!, ...patch, updatedAt: Date.now() };
      courses[idx] = updated;
      return updated;
    },
    async deleteCourse(courseId) {
      const idx = courses.findIndex((c) => c.id === courseId);
      if (idx >= 0) courses.splice(idx, 1);
    },
    async importAndAnalyzeExam(input) {
      const item: ExamItemModel = {
        id: `exam-${Date.now()}`,
        courseId: input.courseId,
        rawText: input.rawText,
        imagePaths: input.images?.map((i) => i.fileName ?? 'image') ?? [],
        analysis: sampleAnalysis,
        orderIndex: examItems.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      examItems.push(item);
      return { item, analysis: sampleAnalysis };
    },
    async listExamItems(courseId) {
      return examItems.filter((e) => e.courseId === courseId);
    },
    async generateCurriculum(input) {
      const plan: CurriculumPlan = {
        overview: '先补齐前置定义域与求导，再攻克含参分类讨论核心模型，最后原题压轴演练。',
        lessons: [
          {
            orderIndex: 1,
            title: '前置基础：定义域与求导通分零失误',
            knowledgePoints: ['对数函数隐含定义域'],
            examItemIndices: [0],
            objective: '稳拿基础 45% 采分点',
            difficulty: 'foundation',
            estimatedMinutes: 15,
            rationale: '先清扫低级失误障碍',
          },
          {
            orderIndex: 2,
            title: '核心模型：含参临界点双轴分类讨论',
            knowledgePoints: ['含参临界值分类讨论'],
            examItemIndices: [0],
            objective: '无遗漏分类并写出规范区间',
            difficulty: 'intermediate',
            estimatedMinutes: 20,
            rationale: '攻克核心拉分点',
          },
        ],
      };

      const created: LessonModel[] = plan.lessons.map((l, idx) => ({
        id: `lesson-${Date.now()}-${idx}`,
        courseId: input.courseId,
        orderIndex: l.orderIndex,
        title: l.title,
        knowledgePoints: l.knowledgePoints,
        examItemIds: [],
        objective: l.objective,
        difficulty: l.difficulty,
        estimatedMinutes: l.estimatedMinutes,
        status: idx === 0 ? 'active' : 'locked',
        stage: 'anchor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      lessons = [...lessons.filter((l) => l.courseId !== input.courseId), ...created];
      return { plan, lessons: created };
    },
    async replanRemainingCurriculum(input) {
      const courseLessons = lessons.filter((l) => l.courseId === input.courseId);
      const completed = courseLessons.filter((l) => l.status === 'mastered');
      const replanned: LessonModel = {
        id: `lesson-replan-${Date.now()}`,
        courseId: input.courseId,
        orderIndex: completed.length + 1,
        title: '【动态重排强化】含参分类讨论防丢分专项',
        knowledgePoints: ['含参临界值分类讨论'],
        examItemIds: [],
        objective: '针对 48% 薄弱点集中突破，确保下次小测 ≥ 80 分通关',
        difficulty: 'intermediate',
        estimatedMinutes: 20,
        status: 'active',
        stage: 'anchor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      lessons = [
        ...lessons.filter((l) => l.courseId !== input.courseId),
        ...completed,
        replanned,
      ];
      return [...completed, replanned];
    },
    async listLessons(courseId) {
      return lessons
        .filter((l) => l.courseId === courseId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
    },
    async listLessonMessages(lessonId) {
      return messages.filter((m) => m.lessonId === lessonId);
    },
    streamLessonTurn(input, onEvent): StreamSubscription {
      const course = courses.find((c) => c.id === input.courseId);
      if (input.userInput?.trim()) {
        messages.push({
          id: `msg-u-${Date.now()}`,
          courseId: input.courseId,
          lessonId: input.lessonId,
          role: 'user',
          content: input.userInput.trim(),
          cardType: 'lecture',
          createdAt: Date.now(),
        });
      }

      const chunks = [
        `【当前实时生效配置：风格=${course?.teachingStyle ?? 'coach'} | 详细度=${course?.detailLevel ?? 'standard'} | 模型源=${input.providerId ?? 'antigravity-cli'}】\n\n`,
        '【🎯 考场触发词】看到含参二次分子 $-2x^2 + 2x + a$，立刻套用“先 $\\Delta$、再韦达看符号”两步走。\n',
        '【✅ 高分采分点】记得在最终结论里把两个递减区间用逗号隔开，绝不写并集符号 $\\cup$。\n\n',
        '请尝试在上方随堂小测卡片中提交你的解答，我将按阅卷采分点为你逐项打分！',
      ];

      let aborted = false;
      let idx = 0;
      let full = '';
      onEvent({
        type: 'thinking_delta',
        text: '读取本地【📊 学情掌握度档案】并注入当前讲课风格与详细程度...',
      });

      const timer = setInterval(() => {
        if (aborted) {
          clearInterval(timer);
          return;
        }
        const piece = chunks[idx];
        if (piece !== undefined) {
          full += piece;
          onEvent({ type: 'text_delta', text: piece });
          idx++;
        } else {
          clearInterval(timer);
          messages.push({
            id: `msg-a-${Date.now()}`,
            courseId: input.courseId,
            lessonId: input.lessonId,
            role: 'assistant',
            content: full,
            cardType: 'lecture',
            providerId: input.providerId ?? 'antigravity-cli',
            model: input.model ?? 'gemini-2.5-pro',
            createdAt: Date.now(),
          });
          onEvent({ type: 'done', finishReason: 'stop' });
        }
      }, 120);

      return {
        unsubscribe: () => {
          aborted = true;
          clearInterval(timer);
        },
        abort: () => {
          aborted = true;
          clearInterval(timer);
          onEvent({ type: 'error', error: { code: 'ABORTED', message: '已中止本次生成。' } });
        },
      };
    },
    async gradeAnswer(input) {
      const mentionsDomain = /x\s*>\s*0|定义域/.test(input.studentAnswer);
      const mentionsTwo = /2/.test(input.studentAnswer);
      const score = mentionsDomain && mentionsTwo ? 90 : mentionsTwo ? 72 : 55;
      const passed = score >= 80;

      const grading: GradingResult = {
        score,
        maxScore: 100,
        passed,
        correctParts: mentionsTwo ? ['正确求得正根 x = 2 并划分单调区间'] : ['写出基本求导思路'],
        missedPoints: mentionsDomain ? [] : ['未显式声明定义域 x > 0（阅卷扣 15 分）'],
        errorTags: passed ? [] : ['trap_missed'],
        diagnosis: passed
          ? '步骤完整、定义域声明规范、成功舍去负根 x = -1，达到考场满分水准！'
          : '关键失分点：未先声明定义域 x > 0 或未明确写出舍去负根的理由。',
        highScoreSolution:
          '解：函数定义域为 $(0, +\\infty)$。\n$$f\'(x) = \\frac{-2x^2 + 2x + 4}{x} = \\frac{-2(x-2)(x+1)}{x}$$\n因为 $x > 0$，舍去 $x = -1$。\n- 当 $x \\in (0, 2)$ 时，$f\'(x) > 0$，$f(x)$ 单调递增；\n- 当 $x \\in (2, +\\infty)$ 时，$f\'(x) < 0$，$f(x)$ 单调递减。',
        pitfallMemo: '见 ln 先写 x > 0，因式分解后务必显式写“舍去负根”。',
        masteryDeltas: [
          {
            knowledgePoint: input.knowledgePoints[0] ?? '含参临界值分类讨论',
            scoreDelta: passed ? 36 : 12,
            suggestedStatus: passed ? 'mastered' : 'consolidating',
            errorTags: passed ? [] : ['trap_missed'],
          },
        ],
        nextAction: passed ? 'advance_lesson' : 'remediate_and_retest',
      };

      // Update mock mastery & unlock next lesson on pass
      const kp = input.knowledgePoints[0] ?? '含参临界值分类讨论';
      const mIdx = masteryRecords.findIndex((m) => m.knowledgePoint === kp);
      if (mIdx >= 0) {
        const rec = masteryRecords[mIdx]!;
        const nextScore = Math.min(100, rec.score + (passed ? 36 : 12));
        masteryRecords[mIdx] = {
          ...rec,
          score: nextScore,
          status: nextScore >= 80 ? 'mastered' : 'consolidating',
          errorTags: passed ? [] : rec.errorTags,
          updatedAt: Date.now(),
        };
      }

      let unlockedLesson: LessonModel | null = null;
      if (passed && input.lessonId) {
        const lIdx = lessons.findIndex((l) => l.id === input.lessonId);
        if (lIdx >= 0) {
          lessons[lIdx] = { ...lessons[lIdx]!, status: 'mastered', stage: 'completed' };
          const next = lessons.find(
            (l) =>
              l.courseId === input.courseId &&
              l.orderIndex > lessons[lIdx]!.orderIndex &&
              l.status === 'locked'
          );
          if (next) {
            next.status = 'active';
            unlockedLesson = next;
          }
        }
      }

      const attempt: PracticeAttemptModel = {
        id: `attempt-${Date.now()}`,
        courseId: input.courseId,
        lessonId: input.lessonId ?? null,
        knowledgePoint: kp,
        questionStem: input.questionStem,
        scoringPoints: input.scoringPoints,
        studentAnswer: input.studentAnswer,
        score: grading.score,
        maxScore: grading.maxScore,
        diagnosis: grading.diagnosis,
        errorTags: grading.errorTags,
        modelSolution: grading.highScoreSolution,
        drillType: 'quiz',
        createdAt: Date.now(),
      };
      practiceAttempts.unshift(attempt);

      return { grading, updatedMastery: [...masteryRecords], attempt, unlockedLesson };
    },
    async listMasteryRecords(courseId) {
      return masteryRecords.filter((m) => m.courseId === courseId);
    },
    async listPracticeAttempts(courseId) {
      return practiceAttempts.filter((a) => a.courseId === courseId);
    },
    async generateTargetedDrills(input): Promise<GeneratedDrillSet> {
      const targetKp =
        input.selectedKnowledgePoints?.[0] ??
        masteryRecords[masteryRecords.length - 1]?.knowledgePoint ??
        '含参临界值分类讨论';
      return {
        drills: [
          {
            knowledgePoint: targetKp,
            strategy: input.focusErrorTag === 'trap_missed' ? 'trap_focus' : 'variant',
            stem: `【私教专项变式】已知 $g(x) = \\ln(2x - 1) - x^2 + x$，请先写定义域，再求单调区间。`,
            hints: ['先列不等式 2x - 1 > 0', '通分后关注分子在 (1/2, +∞) 内的零点'],
            scoringPoints: ['声明定义域 x > 1/2', '正确求导并通分', '写出单调区间'],
            referenceSolution: '定义域为 $(1/2, +\\infty)$，求导后结合正根位置分类讨论。',
            trapWarning: '刻意埋坑：定义域左端点是 1/2 而非 0！',
          },
        ],
      };
    },
    async listProviders() {
      return [...providers];
    },
    async listProviderConfigs() {
      return [...providerConfigs];
    },
    async saveProviderConfig(input) {
      const saved: ProviderConfigModel = {
        id: input.id,
        providerType: input.providerType,
        displayName: input.displayName,
        enabled: input.enabled,
        config: input.config,
        secretRef: input.secretValue ? `preview-keychain://${input.id}` : null,
        isDefault: Boolean(input.isDefault),
        updatedAt: Date.now(),
      };
      const idx = providerConfigs.findIndex((c) => c.id === saved.id);
      if (idx >= 0) providerConfigs[idx] = saved;
      else providerConfigs.push(saved);
      return saved;
    },
    async checkProviderHealth(providerId) {
      return {
        providerId,
        ok: true,
        latencyMs: 42,
        message: `${providerId} 预览模式连接正常`,
      };
    },
    async listProviderModels(providerId): Promise<ModelInfo[]> {
      if (providerId === 'gemini-api') {
        return [
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', providerId, supportsVision: true },
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', providerId, supportsVision: true },
        ];
      }
      return [
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', providerId },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', providerId },
        { id: 'o4-mini', name: 'OpenAI o4-mini', providerId },
      ];
    },
    async getCompanionServerStatus() {
      return companionStatus;
    },
    async setCompanionServerEnabled(enabled) {
      if (enabled) {
        const baseUrl = 'http://192.168.1.25:48720';
        const pairingToken = 'yt-preview-pair-token-8f3c2a1b';
        companionStatus = {
          running: true,
          host: '0.0.0.0',
          port: 48720,
          baseUrl,
          pairingToken,
          qrPayload: JSON.stringify({ protocol: '1.0', baseUrl, token: pairingToken }),
        };
      } else {
        companionStatus = { running: false };
      }
      return companionStatus;
    },
    async syncWithCompanion() {
      return {
        serverTime: Date.now(),
        merged: {
          courses: courses.map((c) => ({
            id: c.id,
            updatedAt: c.updatedAt,
            payload: c as unknown as Record<string, unknown>,
          })),
          lessons: [],
          masteryRecords: masteryRecords.map((m) => ({
            id: m.id,
            updatedAt: m.updatedAt,
            payload: m as unknown as Record<string, unknown>,
          })),
          practiceAttempts: [],
        },
      };
    },
    async captureExamPhoto() {
      return {
        mimeType: 'image/png',
        dataBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        fileName: 'mock-camera-capture.png',
      };
    },
  };
}
