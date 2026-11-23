import {
  type DetailLevel,
  type MasteryRecordModel,
  type TeachingConfig,
  type TeachingStyle,
} from '../../domain/types.js';
import {
  type CurriculumPlanPromptContext,
  type DrillPromptContext,
  type GradingPromptContext,
  type LessonTutorPromptContext,
  type PromptPack,
  type ReverseEngineerPromptContext,
} from '../types.js';
import {
  CORE_TUTOR_ROLE,
  DETAIL_LEVEL_LABELS,
  DRILL_STRATEGY_DESCRIPTIONS,
  ERROR_TAG_LABELS,
  HIGH_SCORE_GUARDRAILS,
  MASTERY_STATUS_BADGES,
  TEACHING_STYLE_LABELS,
} from './templates.js';

/**
 * Default General Exam Prompt Pack grounded in docs/tutor-prompt.md.
 */
export const generalExamPromptPack: PromptPack = {
  id: 'general-exam',
  name: '通用应试提分教研包 (General Exam Tutor)',
  description:
    '适用于中高考、考研、大学专业课、语言与职业资格考试的四阶段考题反推与分课时高分私教教研包。',
  supportedLanguages: ['zh-CN', 'en'],
  version: '1.0.0',

  describeStyle(style: TeachingStyle, customPrompt?: string): string {
    if (style === 'custom' && customPrompt?.trim()) {
      return `自定义风格：${customPrompt.trim()}`;
    }
    return TEACHING_STYLE_LABELS[style];
  },

  describeDetailLevel(level: DetailLevel): string {
    return DETAIL_LEVEL_LABELS[level];
  },

  formatMasteryProfile(
    records: MasteryRecordModel[],
    config: TeachingConfig,
    lessonIndex: number,
    totalLessons: number
  ): string {
    const styleLabel = this.describeStyle(config.style, config.customStylePrompt);
    const detailLabel = this.describeDetailLevel(config.detailLevel);

    const lines: string[] = [
      '【📊 学情掌握度档案】',
      `- 当前配置：风格=[${styleLabel}] | 详细度=[${detailLabel}] | 当前进度=第 ${lessonIndex}/${Math.max(totalLessons, 1)} 课时`,
      '- 考点掌握明细：',
    ];

    if (records.length === 0) {
      lines.push('  （暂无历史掌握记录，本课为初始诊断起点）');
    } else {
      records.forEach((rec, idx) => {
        const statusBadge = MASTERY_STATUS_BADGES[rec.status];
        const errText =
          rec.errorTags.length > 0
            ? rec.errorTags.map((t) => ERROR_TAG_LABELS[t]).join('、')
            : '无';
        lines.push(
          `  ${idx + 1}. ${rec.knowledgePoint} | 分数：${rec.score}/100 | 状态：${statusBadge} | 错因：${errText}`
        );
      });
    }

    const memos = records
      .map((r) => r.pitfallMemo?.trim())
      .filter((m): m is string => Boolean(m && m.length > 0));
    lines.push(
      `- 专属防坑备忘：${memos.length > 0 ? memos.slice(-3).join('；') : '暂无（将在随堂批改后自动沉淀）'}`
    );

    return lines.join('\n');
  },

  buildReverseEngineerPrompt(ctx: ReverseEngineerPromptContext) {
    const systemPrompt = [
      CORE_TUTOR_ROLE,
      '',
      '【当前任务：阶段一 — 考题深度反推（Reverse-Engineering）】',
      '禁止直接扔答案了事！必须严格完成 4 维考题反推并输出符合 JSON Schema 的结构化结果：',
      '1. knowledgePoints（核心考点剥离）：提炼考察的核心知识点并标注考试权重（high_frequency 高频必考 / differentiator 拉分区分点 / foundation 基础送分点）。',
      '2. prerequisiteChain（前置知识链倒推）：按 foundation → core → synthesis 依赖顺序倒推前置概念，使用 dependsOn 引用前置节点的 id。',
      '3. examTraps（命题陷阱与失分点）：指出命题人埋的坑、隐含条件、常见错误与规避口诀。',
      '4. scoringRubric（高分采分点拆解）：从阅卷人视角拆分拿满分必须写出的关键步骤、公式、关键词及权重占比。',
      '',
      'JSON 字段必须精确匹配：',
      '{ "examSummary": string, "knowledgePoints": [{ "name", "weight": "high_frequency"|"differentiator"|"foundation", "description", "examFrequencyHint"? }], "prerequisiteChain": [{ "id", "concept", "level": "foundation"|"core"|"synthesis", "dependsOn": string[], "reason" }], "examTraps": [{ "title", "hiddenCondition", "commonMistake", "avoidanceTip" }], "scoringRubric": [{ "step", "requirement", "weightPercent": number, "keyFormulaOrTerm"? }] }',
    ].join('\n');

    const userPrompt = [
      ctx.examType ? `【考试类型】${ctx.examType}` : '',
      ctx.hasImages ? '【注意】考生同时附带了题目图片，请结合图像与文本完整识别题干与条件。' : '',
      '【考题原文】',
      ctx.examText,
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

    return { systemPrompt, userPrompt };
  },

  buildCurriculumPlanPrompt(ctx: CurriculumPlanPromptContext) {
    const systemPrompt = [
      CORE_TUTOR_ROLE,
      '',
      '【当前任务：阶段二 — 自动课时规划（Auto-Curriculum Planning）】',
      '请基于考题反推结果与考生备考目标，生成渐进式《高分提分课时规划表》（通常 3~8 课时，按题量与知识链深度动态调整）：',
      '- 编排逻辑：先补齐前置依赖（foundation） → 再掌握核心模型（intermediate） → 再回头破解原题（advanced） → 最后变式迁移与防坑压轴（sprint）。',
      '- 每课时必须聚焦清晰、可在 10~30 分钟内完成「精讲 + 原题映射 + 小测通关」。',
      '',
      'JSON 字段必须精确匹配：',
      '{ "overview": string, "lessons": [{ "orderIndex": number (从1递增), "title": string, "knowledgePoints": string[], "examItemIndices": number[], "objective": string, "difficulty": "foundation"|"intermediate"|"advanced"|"sprint", "estimatedMinutes": number, "rationale": string }] }',
    ].join('\n');

    const analysisBlock = ctx.examItems
      .map(
        (item) =>
          `--- 考题 #${item.index} ---\n题干：${item.rawText}\n反推摘要：${item.analysis.examSummary}\n核心考点：${item.analysis.knowledgePoints.map((k) => `${k.name}(${k.weight})`).join('、')}\n前置链：${item.analysis.prerequisiteChain.map((p) => `${p.id}:${p.concept}[${p.level}]<-${p.dependsOn.join(',')}`).join(' -> ')}\n命题陷阱：${item.analysis.examTraps.map((t) => t.title).join('、')}`
      )
      .join('\n\n');

    const userPrompt = [
      `考试类型：${ctx.examType}`,
      ctx.targetScore ? `目标分数：${ctx.targetScore}` : '',
      ctx.prepTime ? `备考时间：${ctx.prepTime}` : '',
      '考题反推汇总：',
      analysisBlock,
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

    return { systemPrompt, userPrompt };
  },

  buildCurriculumReplanPrompt(ctx: CurriculumPlanPromptContext) {
    const base = this.buildCurriculumPlanPrompt(ctx);
    const completedSummary =
      ctx.existingCompletedLessons && ctx.existingCompletedLessons.length > 0
        ? ctx.existingCompletedLessons
            .map(
              (l) =>
                `- 第${l.orderIndex}课时（已通关）：${l.title} [${l.knowledgePoints.join('、')}]`
            )
            .join('\n')
        : '无';

    const masterySummary =
      ctx.masteryRecords && ctx.masteryRecords.length > 0
        ? ctx.masteryRecords
            .map(
              (m) =>
                `- ${m.knowledgePoint}：${m.score}/100 (${MASTERY_STATUS_BADGES[m.status]}) 错因=[${m.errorTags.map((t) => ERROR_TAG_LABELS[t]).join('、') || '无'}]`
            )
            .join('\n')
        : '暂无学情记录';

    const startOrder = (ctx.existingCompletedLessons?.length ?? 0) + 1;
    const systemPrompt = [
      base.systemPrompt,
      '',
      '【动态重排剩余课时指令】',
      `已完成课时不可重复安排，请仅规划剩余未通关的课时，orderIndex 从 ${startOrder} 开始连续编号。`,
      '- 对状态为 🔴薄弱 / 🟡待巩固 的考点优先插入针对性补强与防坑专项课时；',
      '- 对状态已达 🟢已掌握 的前置考点可合并跳过，直接推进原题破解与拔高。',
    ].join('\n');

    const userPrompt = [
      base.userPrompt,
      `【已通关课时】\n${completedSummary}`,
      `【最新学情掌握度】\n${masterySummary}`,
    ].join('\n\n');

    return { systemPrompt, userPrompt };
  },

  buildLessonSystemPrompt(ctx: LessonTutorPromptContext): string {
    const masteryProfile = this.formatMasteryProfile(
      ctx.masteryRecords,
      ctx.teachingConfig,
      ctx.lesson.orderIndex,
      ctx.totalLessons
    );

    const examSnippets =
      ctx.relatedExamItems.length > 0
        ? ctx.relatedExamItems.map((item, idx) => `原题 ${idx + 1}：${item.rawText}`).join('\n')
        : '（本课为前置基础铺垫，将在核心模型完成后映射回原题）';

    const spacedReviewBlock =
      ctx.spacedReviewPoints && ctx.spacedReviewPoints.length > 0
        ? [
            '【🔁 间隔抗遗忘复盘触发】',
            `请在本课随堂诊断小测中，额外穿插 1 道针对以下历史薄弱/待巩固考点的变式复盘题：${ctx.spacedReviewPoints.map((p) => `${p.knowledgePoint}(${MASTERY_STATUS_BADGES[p.status]})`).join('、')}。`,
          ].join('\n')
        : '';

    return [
      CORE_TUTOR_ROLE,
      '',
      HIGH_SCORE_GUARDRAILS,
      '',
      masteryProfile,
      '',
      `【当前授课上下文 — 课程：${ctx.courseTitle}（${ctx.examType}）】`,
      `- 当前课时：第 ${ctx.lesson.orderIndex}/${ctx.totalLessons} 课时《${ctx.lesson.title}》`,
      `- 对应考点：${ctx.lesson.knowledgePoints.join('、')}`,
      `- 高分目标：${ctx.lesson.objective}`,
      `- 当前难度：${ctx.lesson.difficulty}（预计 ${ctx.lesson.estimatedMinutes} 分钟）`,
      `- 关联原题：\n${examSnippets}`,
      '',
      '【本课时 5 步微闭环执行规范】',
      '1. 本课锚点：2~3 句说明本课攻克原题中的哪块核心障碍。',
      '2. 核心精讲：严格按当前【讲课风格】与【详细程度】讲解，显式标出 【🎯 考场触发词】、【✅ 高分采分点】、【⚠️ 易错深坑】。',
      '3. 原题实战映射：把刚讲的方法直接套回关联原题对应步骤，演示考场实战用法。',
      '4. 随堂诊断小测：紧扣本课内容出 1~2 道小测题，出完题后**立即停顿并等待考生作答**（绝不提前泄露答案）。',
      '5. 若考生要求临时调整风格或详细程度（如“讲细一点”“换幽默风格”“跳过基础”），立即按新配置回应。',
      spacedReviewBlock,
    ]
      .filter((s) => s.length > 0)
      .join('\n');
  },

  buildGradingPrompt(ctx: GradingPromptContext) {
    const systemPrompt = [
      CORE_TUTOR_ROLE,
      '',
      '【当前任务：阶段三/四 — 阅卷级批改与学情回写】',
      '请以严格阅卷老师的视角批改考生作答：',
      '1. 按采分点逐项核对，给出 0~100 模拟得分，明确列出 correctParts（做对步骤）与 missedPoints（失分点）。',
      '2. 精准分类错因 errorTags（仅使用 concept_gap / logic_break / trap_missed / step_deduction），绝不笼统说“再想想”。',
      '3. 给出高分考场标准写法 highScoreSolution 与 1~2 句专属防坑口诀 pitfallMemo。',
      '4. 计算 masteryDeltas（每个涉及考点的分数变化 scoreDelta 与建议状态 suggestedStatus）。',
      '5. 通关门控：仅当得分 >= 80 且无核心概念盲区时 passed=true、nextAction="advance_lesson"；否则 passed=false、nextAction="remediate_and_retest"。',
      '',
      'JSON 字段必须精确匹配：',
      '{ "score": number, "maxScore": 100, "passed": boolean, "correctParts": string[], "missedPoints": string[], "errorTags": ("concept_gap"|"logic_break"|"trap_missed"|"step_deduction")[], "diagnosis": string, "highScoreSolution": string, "pitfallMemo": string, "masteryDeltas": [{ "knowledgePoint": string, "scoreDelta": number, "suggestedStatus": "unlearned"|"weak"|"consolidating"|"mastered", "errorTags": string[], "pitfallMemo"?: string }], "nextAction": "advance_lesson"|"remediate_and_retest" }',
    ].join('\n');

    const currentMastery = ctx.currentMasteryRecords
      .filter((r) => ctx.knowledgePoints.includes(r.knowledgePoint))
      .map((r) => `${r.knowledgePoint}: ${r.score}/100 (${r.status})`)
      .join('; ');

    const userPrompt = [
      `考试类型：${ctx.examType}`,
      ctx.lessonTitle ? `所属课时：${ctx.lessonTitle}` : '',
      `考察考点：${ctx.knowledgePoints.join('、')}`,
      currentMastery ? `当前学情基线：${currentMastery}` : '',
      `【题目】\n${ctx.questionStem}`,
      `【参考采分点】\n${ctx.scoringPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      `【考生作答】\n${ctx.studentAnswer}`,
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

    return { systemPrompt, userPrompt };
  },

  buildDrillPrompt(ctx: DrillPromptContext) {
    const systemPrompt = [
      CORE_TUTOR_ROLE,
      '',
      '【当前任务：阶段四 — 私教针对性精准出题（Adaptive Targeted Drills）】',
      '请严格按照每个目标考点指定的出题策略生成高质量应试训练题：',
      ...Object.entries(DRILL_STRATEGY_DESCRIPTIONS).map(([k, desc]) => `- ${k}: ${desc}`),
      '',
      '每道题必须包含清晰的题干（stem）、渐进式提示（hints）、阅卷采分点（scoringPoints）、高分标准解答（referenceSolution）和防坑提醒（trapWarning）。',
      'JSON 字段必须精确匹配：',
      '{ "drills": [{ "knowledgePoint": string, "strategy": "concept_check"|"variant"|"trap_focus"|"synthesis"|"spaced_review", "stem": string, "hints": string[], "scoringPoints": string[], "referenceSolution": string, "trapWarning": string }] }',
    ].join('\n');

    const targetLines = ctx.targets
      .map((t, idx) => {
        const rec = t.record;
        const statusInfo = rec
          ? `当前分数=${rec.score}/100, 状态=${MASTERY_STATUS_BADGES[rec.status]}, 历史错因=[${rec.errorTags.map((e) => ERROR_TAG_LABELS[e]).join('、') || '无'}], 防坑备忘=${rec.pitfallMemo ?? '无'}`
          : '首次练习';
        return `${idx + 1}. 考点：${t.knowledgePoint} | 指定策略：${t.strategy} | 学情：${statusInfo}`;
      })
      .join('\n');

    const userPrompt = [
      `考试类型：${ctx.examType}`,
      `出题数量：严格生成 ${ctx.count} 道题`,
      `【靶向考点与策略清单】\n${targetLines}`,
      ctx.relatedExamTexts && ctx.relatedExamTexts.length > 0
        ? `【参考原题母题】\n${ctx.relatedExamTexts.join('\n---\n')}`
        : '',
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

    return { systemPrompt, userPrompt };
  },
};
