import { afterEach, describe, expect, it } from 'vitest';
import { type ReverseEngineeringAnalysis } from '@yourtutor/core';
import { createStorage, type TutorStorage } from '../repositories/index.js';
import { createBetterSqlite3Driver, NodeSqliteDriver } from '../driver.js';
import { runMigrations } from '../migrations/index.js';

let activeStorage: TutorStorage | null = null;

afterEach(async () => {
  if (activeStorage) {
    await activeStorage.close();
    activeStorage = null;
  }
});

const SAMPLE_ANALYSIS: ReverseEngineeringAnalysis = {
  examSummary: '极限与洛必达法则综合题',
  knowledgePoints: [
    { name: '等价无穷小替换', weight: 'high_frequency', description: '乘除因子替换规则' },
  ],
  prerequisiteChain: [
    {
      id: 'p1',
      concept: '泰勒展开前两项',
      level: 'foundation',
      dependsOn: [],
      reason: '防替换陷阱',
    },
  ],
  examTraps: [
    {
      title: '加减法误用等价无穷小',
      hiddenCondition: '分子为两项相减',
      commonMistake: '直接把 sin x - x 替换为 x - x = 0',
      avoidanceTip: '加减用泰勒，乘除用等价',
    },
  ],
  scoringRubric: [
    { step: '验证 0/0 型', requirement: '指出未定式类型', weightPercent: 20 },
    { step: '展开并化简', requirement: '展开至 x^3 阶', weightPercent: 80 },
  ],
};

describe('YourTutor Local Persistence Layer (@yourtutor/storage)', () => {
  it('runs migrations idempotently and supports all 7 repositories end-to-end', async () => {
    const driver = new NodeSqliteDriver(':memory:');
    activeStorage = await createStorage(driver);

    expect(activeStorage.migrations.appliedIds).toEqual(['0001_initial_schema']);
    expect(activeStorage.migrations.skippedIds).toEqual([]);

    // Re-running migrations must be a safe no-op
    const secondRun = await runMigrations(driver);
    expect(secondRun.appliedIds).toEqual([]);
    expect(secondRun.skippedIds).toEqual(['0001_initial_schema']);

    // 1. courses
    const course = await activeStorage.courses.create({
      title: '考研数学一极限冲刺',
      examType: '考研数学一',
      targetScore: '130/150',
      prepTime: '60天',
      teachingStyle: 'coach',
      detailLevel: 'standard',
    });
    expect(course.teachingStyle).toBe('coach');

    const updatedCourse = await activeStorage.courses.update(course.id, {
      teachingStyle: 'socratic',
      detailLevel: 'zero_base',
    });
    expect(updatedCourse?.teachingStyle).toBe('socratic');
    expect(updatedCourse?.detailLevel).toBe('zero_base');

    // 2. exam_items
    const examItem = await activeStorage.examItems.create({
      courseId: course.id,
      rawText: '求极限 lim_{x->0} (sin x - x) / x^3',
      imagePaths: ['/attachments/exam-01.png'],
    });
    const analyzedItem = await activeStorage.examItems.saveAnalysis(examItem.id, SAMPLE_ANALYSIS);
    expect(analyzedItem?.analysis?.examSummary).toBe('极限与洛必达法则综合题');
    expect(analyzedItem?.imagePaths).toEqual(['/attachments/exam-01.png']);

    // 3. lessons & progression unlocking
    const lessons = await activeStorage.lessons.createMany([
      {
        courseId: course.id,
        orderIndex: 1,
        title: '等价无穷小与泰勒防坑基础',
        knowledgePoints: ['等价无穷小替换'],
        examItemIds: [examItem.id],
        objective: '区分乘除与加减场景',
        difficulty: 'foundation',
        estimatedMinutes: 15,
      },
      {
        courseId: course.id,
        orderIndex: 2,
        title: '原题满分演练',
        knowledgePoints: ['等价无穷小替换', '泰勒展开'],
        examItemIds: [examItem.id],
        objective: '规范拿满计算步骤分',
        difficulty: 'intermediate',
        estimatedMinutes: 20,
      },
    ]);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]?.status).toBe('active');
    expect(lessons[1]?.status).toBe('locked');

    const { completed, unlocked } = await activeStorage.lessons.completeAndUnlockNext(
      lessons[0]!.id
    );
    expect(completed?.status).toBe('mastered');
    expect(unlocked?.id).toBe(lessons[1]!.id);
    expect(unlocked?.status).toBe('active');

    // Adaptive replan keeps mastered Lesson 1 and replaces remaining lessons
    const afterReplan = await activeStorage.lessons.replaceRemainingLessons(course.id, [
      {
        courseId: course.id,
        orderIndex: 2,
        title: '泰勒展开防坑专项强化',
        knowledgePoints: ['泰勒展开'],
        objective: '彻底消灭加减误替换',
        difficulty: 'advanced',
        estimatedMinutes: 20,
      },
    ]);
    expect(afterReplan).toHaveLength(2);
    expect(afterReplan[0]?.status).toBe('mastered');
    expect(afterReplan[1]?.title).toBe('泰勒展开防坑专项强化');
    expect(afterReplan[1]?.status).toBe('active');

    // 4. messages
    await activeStorage.messages.append({
      courseId: course.id,
      lessonId: afterReplan[1]!.id,
      role: 'assistant',
      content: '【🎯 考场触发词】看到加减结构优先泰勒展开',
      cardType: 'lecture',
      providerId: 'antigravity-cli',
      model: 'gemini-2.5-pro',
    });
    const msgs = await activeStorage.messages.listByLesson(afterReplan[1]!.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.cardType).toBe('lecture');
    expect(msgs[0]?.providerId).toBe('antigravity-cli');

    // 5. mastery_records & projections
    await activeStorage.mastery.applyProjections(course.id, [
      {
        knowledgePoint: '等价无穷小替换',
        previousScore: 0,
        newScore: 52,
        status: 'weak',
        errorTags: ['trap_missed'],
        pitfallMemo: '加减用泰勒，乘除用等价',
        reviewCount: 1,
        lastReviewedLessonIndex: 1,
        updatedAt: Date.now(),
      },
    ]);
    const weakList = await activeStorage.mastery.listWeakOrConsolidating(course.id);
    expect(weakList).toHaveLength(1);
    expect(weakList[0]?.pitfallMemo).toBe('加减用泰勒，乘除用等价');

    // 6. practice_attempts
    const attempt = await activeStorage.practiceAttempts.create({
      courseId: course.id,
      lessonId: afterReplan[1]!.id,
      knowledgePoint: '等价无穷小替换',
      questionStem: '计算 lim_{x->0} (tan x - sin x) / x^3',
      scoringPoints: ['提取 sin x', '化简 1 - cos x ~ x^2/2'],
      studentAnswer: '结果是 1/2',
      score: 60,
      diagnosis: '缺少等价无穷小推导步骤，阅卷会扣步骤分',
      errorTags: ['step_deduction'],
      drillType: 'trap_focus',
    });
    expect(attempt.score).toBe(60);
    const attemptsByKp = await activeStorage.practiceAttempts.listByKnowledgePoint(
      course.id,
      '等价无穷小替换'
    );
    expect(attemptsByKp).toHaveLength(1);

    // 7. provider_configs (must reject plaintext secrets and accept secretRef)
    await expect(
      activeStorage.providerConfigs.save({
        id: 'openai-bad',
        providerType: 'openai-compatible',
        displayName: 'Unsafe Provider',
        config: { apiKey: 'sk-plaintext-leak' },
      })
    ).rejects.toThrow(/plaintext secret/i);

    const savedCfg = await activeStorage.providerConfigs.save({
      id: 'openai-deepseek',
      providerType: 'openai-compatible',
      displayName: 'DeepSeek',
      config: { baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
      secretRef: 'keychain://yourtutor/openai-deepseek',
      isDefault: true,
    });
    expect(savedCfg.secretRef).toBe('keychain://yourtutor/openai-deepseek');
    expect(savedCfg.isDefault).toBe(true);

    // Foreign key cascade: deleting course removes exam items, lessons, messages, mastery, practice attempts
    const deleted = await activeStorage.courses.delete(course.id);
    expect(deleted).toBe(true);
    expect(await activeStorage.examItems.listByCourse(course.id)).toHaveLength(0);
    expect(await activeStorage.lessons.listByCourse(course.id)).toHaveLength(0);
    expect(await activeStorage.mastery.listByCourse(course.id)).toHaveLength(0);
    expect(await activeStorage.practiceAttempts.listByCourse(course.id)).toHaveLength(0);
  });

  it('rolls back driver transactions cleanly on error', async () => {
    const driver = new NodeSqliteDriver(':memory:');
    activeStorage = await createStorage(driver);

    await expect(
      driver.transaction(async () => {
        await activeStorage!.courses.create({
          id: 'tx-course',
          title: 'Will rollback',
          examType: 'Test',
        });
        throw new Error('Simulated failure');
      })
    ).rejects.toThrow('Simulated failure');

    expect(await activeStorage.courses.findById('tx-course')).toBeNull();
  });

  it('supports createBetterSqlite3Driver adapter with raw positional rows', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const rawDb = new DatabaseSync(':memory:');

    // Thin shim adapting node:sqlite to BetterSqlite3Like (.raw(true)) to verify the adapter contract
    const betterLike = {
      exec: (sql: string) => rawDb.exec(sql),
      prepare: (sql: string) => {
        const stmt = rawDb.prepare(sql);
        const wrapper = {
          raw: (toggle = true) => {
            stmt.setReturnArrays(toggle);
            return wrapper;
          },
          all: (...params: unknown[]) => stmt.all(...(params as Array<string | number | null>)),
          run: (...params: unknown[]) => {
            const res = stmt.run(...(params as Array<string | number | null>));
            return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
          },
        };
        return wrapper;
      },
      close: () => rawDb.close(),
    };

    const driver = createBetterSqlite3Driver(betterLike);
    activeStorage = await createStorage(driver);

    const created = await activeStorage.courses.create({
      title: 'IELTS Writing Task 2',
      examType: 'IELTS',
      teachingStyle: 'academic',
      detailLevel: 'concise',
    });
    const loaded = await activeStorage.courses.findById(created.id);
    expect(loaded?.title).toBe('IELTS Writing Task 2');
    expect(loaded?.teachingStyle).toBe('academic');
  });
});
