import {
  AnthropicApiProvider,
  CompanionBridgeProvider,
  type CompanionSyncResponse,
  type CourseModel,
  CurriculumPlannerService,
  type DetailLevel,
  type ErrorTag,
  type ExamItemModel,
  GeminiApiProvider,
  GradingAndDrillService,
  type LessonModel,
  LessonTutorService,
  type MasteryRecordModel,
  OpenAICompatibleProvider,
  type ProviderConfigModel,
  ProviderRegistry,
  type ReverseEngineeringAnalysis,
  ReverseEngineerService,
  type TeachingStyle,
} from '@yourtutor/core';
import { type TutorStorage } from '@yourtutor/storage';
import {
  type AppBridge,
  type CapturedImageAttachment,
  type HostCapabilities,
  type ProviderSummary,
  type StreamSubscription,
} from '@yourtutor/ui';
import { captureAndCompressExamPhoto } from './image-processor.js';
import { type MobileSecretStore } from './keystore-secret-store.js';

export interface MobileAppBridgeOptions {
  storage: TutorStorage;
  secretStore: MobileSecretStore;
  registry?: ProviderRegistry;
  deviceId?: string;
  capturePhotoFn?: (source: 'camera' | 'gallery') => Promise<CapturedImageAttachment | null>;
  fetchFn?: typeof fetch;
}

/**
 * Android Mobile implementation of the shared `@yourtutor/ui` `AppBridge` contract.
 *
 * Dual-mode model connectivity:
 * 1. Standalone Mode: Direct HTTPS calls to Gemini / OpenAI / Anthropic / DeepSeek / OpenRouter /
 *    custom OpenAI-compatible APIs — works completely offline from any PC.
 * 2. Companion Bridge Mode: Pairs with a Desktop/Server Companion via QR code or URL + Bearer Token
 *    to reuse desktop Antigravity / Codex / Claude Code subscriptions & merge study profiles.
 */
export class MobileAppBridge implements AppBridge {
  readonly storage: TutorStorage;
  readonly registry: ProviderRegistry;

  private readonly secretStore: MobileSecretStore;
  private readonly deviceId: string;
  private readonly capturePhotoFn: (
    source: 'camera' | 'gallery'
  ) => Promise<CapturedImageAttachment | null>;
  private readonly fetchFn?: typeof fetch;

  private readonly reverseEngineer = new ReverseEngineerService();
  private readonly curriculumPlanner = new CurriculumPlannerService();
  private readonly lessonTutor = new LessonTutorService();
  private readonly gradingAndDrill = new GradingAndDrillService();

  constructor(options: MobileAppBridgeOptions) {
    this.storage = options.storage;
    this.secretStore = options.secretStore;
    this.registry = options.registry ?? new ProviderRegistry();
    this.deviceId = options.deviceId ?? `android-${crypto.randomUUID().slice(0, 8)}`;
    this.capturePhotoFn = options.capturePhotoFn ?? captureAndCompressExamPhoto;
    this.fetchFn = options.fetchFn;
  }

  async initializeFromStoredConfigs(): Promise<void> {
    const configs = await this.storage.providerConfigs.listAll();
    for (const cfg of configs) {
      if (!cfg.enabled) continue;
      await this.registerMobileProvider(cfg);
    }
  }

  private async registerMobileProvider(cfg: ProviderConfigModel): Promise<void> {
    const secret = cfg.secretRef ? await this.secretStore.getSecret(cfg.secretRef) : null;
    const baseUrl = typeof cfg.config.baseUrl === 'string' ? cfg.config.baseUrl : '';
    const defaultModel =
      typeof cfg.config.defaultModel === 'string' ? cfg.config.defaultModel : 'gemini-2.5-flash';

    if (cfg.providerType === 'openai-compatible' && baseUrl) {
      this.registry.register(
        new OpenAICompatibleProvider({
          id: cfg.id,
          name: cfg.displayName,
          baseUrl,
          apiKey: secret ?? undefined,
          defaultModel,
          fetchFn: this.fetchFn,
        }),
        { setAsDefault: cfg.isDefault }
      );
    } else if (cfg.providerType === 'anthropic-api' && secret) {
      this.registry.register(
        new AnthropicApiProvider({
          id: cfg.id,
          name: cfg.displayName,
          apiKey: secret,
          baseUrl: baseUrl || undefined,
          defaultModel,
          fetchFn: this.fetchFn,
        }),
        { setAsDefault: cfg.isDefault }
      );
    } else if (cfg.providerType === 'gemini-api' && secret) {
      this.registry.register(
        new GeminiApiProvider({
          id: cfg.id,
          name: cfg.displayName,
          apiKey: secret,
          baseUrl: baseUrl || undefined,
          defaultModel,
          fetchFn: this.fetchFn,
        }),
        { setAsDefault: cfg.isDefault }
      );
    } else if (cfg.providerType === 'companion-bridge' && baseUrl && secret) {
      this.registry.register(
        new CompanionBridgeProvider({
          id: cfg.id,
          name: cfg.displayName,
          baseUrl,
          pairingToken: secret,
          fetchFn: this.fetchFn,
        }),
        { setAsDefault: cfg.isDefault }
      );
    }
  }

  async getHostCapabilities(): Promise<HostCapabilities> {
    return {
      platform: 'mobile-android',
      supportsLocalCli: false,
      supportsCompanionServer: false,
      supportsCameraCapture: true,
      supportsClipboardImagePaste: false,
    };
  }

  listCourses(): Promise<CourseModel[]> {
    return this.storage.courses.listAll();
  }

  getCourse(courseId: string): Promise<CourseModel | null> {
    return this.storage.courses.findById(courseId);
  }

  createCourse(input: {
    title: string;
    examType: string;
    targetScore?: string;
    prepTime?: string;
    teachingStyle?: TeachingStyle;
    customStylePrompt?: string;
    detailLevel?: DetailLevel;
    packId?: string;
  }): Promise<CourseModel> {
    return this.storage.courses.create(input);
  }

  async updateCourseSettings(
    courseId: string,
    patch: {
      title?: string;
      targetScore?: string | null;
      prepTime?: string | null;
      teachingStyle?: TeachingStyle;
      customStylePrompt?: string | null;
      detailLevel?: DetailLevel;
      packId?: string;
    }
  ): Promise<CourseModel> {
    const updated = await this.storage.courses.update(courseId, patch);
    if (!updated) {
      throw new Error(`Course '${courseId}' not found.`);
    }
    return updated;
  }

  async deleteCourse(courseId: string): Promise<void> {
    await this.storage.courses.delete(courseId);
  }

  async importAndAnalyzeExam(input: {
    courseId: string;
    rawText: string;
    images?: CapturedImageAttachment[];
    providerId?: string;
    model?: string;
  }): Promise<{ item: ExamItemModel; analysis: ReverseEngineeringAnalysis }> {
    const course = await this.storage.courses.findById(input.courseId);
    if (!course) {
      throw new Error(`Course '${input.courseId}' not found.`);
    }
    const provider = this.registry.resolveForTask('reverse_engineer', input.providerId);
    const { analysis } = await this.reverseEngineer.analyze({
      examText: input.rawText,
      examType: course.examType,
      images: input.images?.map((img) => ({
        mimeType: img.mimeType,
        dataBase64: img.dataBase64,
      })),
      provider,
      model: input.model,
    });

    const existing = await this.storage.examItems.listByCourse(course.id);
    const item = await this.storage.examItems.create({
      courseId: course.id,
      rawText: input.rawText,
      imagePaths: input.images?.map((i) => i.fileName ?? 'camera-photo.jpg') ?? [],
      analysis,
      orderIndex: existing.length,
    });

    for (const kp of analysis.knowledgePoints) {
      const exists = await this.storage.mastery.findByKnowledgePoint(course.id, kp.name);
      if (!exists) {
        await this.storage.mastery.upsert({
          courseId: course.id,
          knowledgePoint: kp.name,
          score: 0,
          status: 'unlearned',
        });
      }
    }

    return { item, analysis };
  }

  listExamItems(courseId: string): Promise<ExamItemModel[]> {
    return this.storage.examItems.listByCourse(courseId);
  }

  async generateCurriculum(input: {
    courseId: string;
    providerId?: string;
    model?: string;
  }) {
    const course = await this.storage.courses.findById(input.courseId);
    if (!course) {
      throw new Error(`Course '${input.courseId}' not found.`);
    }
    const examItems = await this.storage.examItems.listByCourse(course.id);
    const analyzed = examItems
      .filter((e): e is ExamItemModel & { analysis: ReverseEngineeringAnalysis } =>
        Boolean(e.analysis)
      )
      .map((e, index) => ({ index, rawText: e.rawText, analysis: e.analysis }));

    const provider = this.registry.resolveForTask('plan', input.providerId);
    const { plan } = await this.curriculumPlanner.planCurriculum({
      examType: course.examType,
      targetScore: course.targetScore ?? undefined,
      prepTime: course.prepTime ?? undefined,
      examItems: analyzed,
      provider,
      model: input.model,
    });

    const lessons = await this.storage.lessons.replaceRemainingLessons(
      course.id,
      plan.lessons.map((l) => ({
        courseId: course.id,
        orderIndex: l.orderIndex,
        title: l.title,
        knowledgePoints: l.knowledgePoints,
        examItemIds: l.examItemIndices
          .map((idx) => examItems[idx]?.id)
          .filter((id): id is string => Boolean(id)),
        objective: l.objective,
        difficulty: l.difficulty,
        estimatedMinutes: l.estimatedMinutes,
      }))
    );

    return { plan, lessons };
  }

  async replanRemainingCurriculum(input: {
    courseId: string;
    providerId?: string;
    model?: string;
  }): Promise<LessonModel[]> {
    const course = await this.storage.courses.findById(input.courseId);
    if (!course) {
      throw new Error(`Course '${input.courseId}' not found.`);
    }
    const [examItems, existingLessons, masteryRecords] = await Promise.all([
      this.storage.examItems.listByCourse(course.id),
      this.storage.lessons.listByCourse(course.id),
      this.storage.mastery.listByCourse(course.id),
    ]);

    const analyzed = examItems
      .filter((e): e is ExamItemModel & { analysis: ReverseEngineeringAnalysis } =>
        Boolean(e.analysis)
      )
      .map((e, index) => ({ index, rawText: e.rawText, analysis: e.analysis }));

    const provider = this.registry.resolveForTask('plan', input.providerId);
    const { remainingPlan } = await this.curriculumPlanner.replanRemainingLessons({
      examType: course.examType,
      targetScore: course.targetScore ?? undefined,
      prepTime: course.prepTime ?? undefined,
      examItems: analyzed,
      existingLessons,
      masteryRecords,
      provider,
      model: input.model,
    });

    return this.storage.lessons.replaceRemainingLessons(
      course.id,
      remainingPlan.lessons.map((l) => ({
        courseId: course.id,
        orderIndex: l.orderIndex,
        title: l.title,
        knowledgePoints: l.knowledgePoints,
        examItemIds: l.examItemIndices
          .map((idx) => examItems[idx]?.id)
          .filter((id): id is string => Boolean(id)),
        objective: l.objective,
        difficulty: l.difficulty,
        estimatedMinutes: l.estimatedMinutes,
      }))
    );
  }

  listLessons(courseId: string) {
    return this.storage.lessons.listByCourse(courseId);
  }

  listLessonMessages(lessonId: string) {
    return this.storage.messages.listByLesson(lessonId);
  }

  streamLessonTurn(
    input: {
      courseId: string;
      lessonId: string;
      userInput?: string;
      providerId?: string;
      model?: string;
    },
    onEvent: Parameters<AppBridge['streamLessonTurn']>[1]
  ): StreamSubscription {
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        const [course, lessons, lesson, history, masteryRecords, examItems] = await Promise.all([
          this.storage.courses.findById(input.courseId),
          this.storage.lessons.listByCourse(input.courseId),
          this.storage.lessons.findById(input.lessonId),
          this.storage.messages.listByLesson(input.lessonId),
          this.storage.mastery.listByCourse(input.courseId),
          this.storage.examItems.listByCourse(input.courseId),
        ]);

        if (!course || !lesson) {
          if (active) {
            onEvent({
              type: 'error',
              error: { code: 'UNKNOWN', message: 'Course or lesson not found.' },
            });
          }
          return;
        }

        if (input.userInput?.trim()) {
          await this.storage.messages.append({
            courseId: course.id,
            lessonId: lesson.id,
            role: 'user',
            content: input.userInput.trim(),
            cardType: 'lecture',
          });
        }

        const provider = this.registry.resolveForTask('teach', input.providerId);
        let fullText = '';

        for await (const ev of this.lessonTutor.streamLessonTurn({
          courseTitle: course.title,
          examType: course.examType,
          lesson,
          totalLessons: lessons.length,
          teachingConfig: {
            style: course.teachingStyle,
            customStylePrompt: course.customStylePrompt ?? undefined,
            detailLevel: course.detailLevel,
          },
          masteryRecords,
          relatedExamItems: examItems,
          history,
          userInput: input.userInput,
          provider,
          model: input.model,
          signal: controller.signal,
        })) {
          if (ev.type === 'text_delta') {
            fullText += ev.text;
          }
          if (active) {
            onEvent(ev);
          }
        }

        if (fullText.trim().length > 0) {
          await this.storage.messages.append({
            courseId: course.id,
            lessonId: lesson.id,
            role: 'assistant',
            content: fullText,
            cardType: 'lecture',
            providerId: provider.id,
            model: input.model ?? null,
          });
        }
      } catch (err) {
        if (active) {
          onEvent({
            type: 'error',
            error: {
              code: 'UNKNOWN',
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    })();

    return {
      unsubscribe: () => {
        active = false;
      },
      abort: () => {
        active = false;
        controller.abort();
      },
    };
  }

  async gradeAnswer(input: {
    courseId: string;
    lessonId?: string;
    knowledgePoints: string[];
    questionStem: string;
    scoringPoints: string[];
    studentAnswer: string;
    providerId?: string;
    model?: string;
  }) {
    const course = await this.storage.courses.findById(input.courseId);
    if (!course) {
      throw new Error(`Course '${input.courseId}' not found.`);
    }
    const lesson = input.lessonId ? await this.storage.lessons.findById(input.lessonId) : null;
    const currentMastery = await this.storage.mastery.listByCourse(course.id);
    const provider = this.registry.resolveForTask('grade', input.providerId);

    const { grading, masteryUpdates } = await this.gradingAndDrill.gradeSubmission({
      courseId: course.id,
      examType: course.examType,
      lessonTitle: lesson?.title,
      lessonOrderIndex: lesson?.orderIndex,
      knowledgePoints: input.knowledgePoints,
      questionStem: input.questionStem,
      scoringPoints: input.scoringPoints,
      studentAnswer: input.studentAnswer,
      currentMasteryRecords: currentMastery,
      provider,
      model: input.model,
    });

    const updatedMastery = await this.storage.mastery.applyProjections(course.id, masteryUpdates);
    const attempt = await this.storage.practiceAttempts.create({
      courseId: course.id,
      lessonId: input.lessonId ?? null,
      knowledgePoint: input.knowledgePoints[0] ?? '综合考点',
      questionStem: input.questionStem,
      scoringPoints: input.scoringPoints,
      studentAnswer: input.studentAnswer,
      score: grading.score,
      maxScore: grading.maxScore,
      diagnosis: grading.diagnosis,
      errorTags: grading.errorTags,
      modelSolution: grading.highScoreSolution,
      drillType: input.lessonId ? 'quiz' : 'variant',
    });

    let unlockedLesson: LessonModel | null = null;
    if (grading.passed && input.lessonId) {
      const res = await this.storage.lessons.completeAndUnlockNext(input.lessonId);
      unlockedLesson = res.unlocked;
    }

    return { grading, updatedMastery, attempt, unlockedLesson };
  }

  listMasteryRecords(courseId: string) {
    return this.storage.mastery.listByCourse(courseId);
  }

  listPracticeAttempts(courseId: string) {
    return this.storage.practiceAttempts.listByCourse(courseId);
  }

  async generateTargetedDrills(input: {
    courseId: string;
    selectedKnowledgePoints?: string[];
    focusErrorTag?: ErrorTag;
    count?: number;
    providerId?: string;
    model?: string;
  }) {
    const [course, masteryRecords, examItems, lessons] = await Promise.all([
      this.storage.courses.findById(input.courseId),
      this.storage.mastery.listByCourse(input.courseId),
      this.storage.examItems.listByCourse(input.courseId),
      this.storage.lessons.listByCourse(input.courseId),
    ]);
    if (!course) {
      throw new Error(`Course '${input.courseId}' not found.`);
    }

    const activeLesson = lessons.find((l) => l.status === 'active');
    const provider = this.registry.resolveForTask('drill', input.providerId);
    const { drillSet } = await this.gradingAndDrill.generateTargetedDrills({
      examType: course.examType,
      masteryRecords,
      selectedKnowledgePoints: input.selectedKnowledgePoints,
      focusErrorTag: input.focusErrorTag,
      currentLessonOrderIndex: activeLesson?.orderIndex,
      count: input.count,
      relatedExamTexts: examItems.map((e) => e.rawText),
      provider,
      model: input.model,
    });
    return drillSet;
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const defaultId = this.registry.getDefault()?.id;
    // Android MUST only surface universal-api and companion-remote providers (never local desktop-cli)
    return this.registry.listMobileCompatible().map((provider) => ({
      id: provider.id,
      name: provider.name,
      capabilities: provider.capabilities,
      enabled: true,
      isDefault: provider.id === defaultId,
    }));
  }

  listProviderConfigs(): Promise<ProviderConfigModel[]> {
    return this.storage.providerConfigs.listAll();
  }

  async saveProviderConfig(input: {
    id: string;
    providerType: string;
    displayName: string;
    enabled: boolean;
    config: Record<string, unknown>;
    secretValue?: string;
    isDefault?: boolean;
  }): Promise<ProviderConfigModel> {
    let secretRef: string | undefined;
    if (input.secretValue?.trim()) {
      secretRef = await this.secretStore.setSecret(input.id, input.secretValue.trim());
    }

    const saved = await this.storage.providerConfigs.save({
      id: input.id,
      providerType: input.providerType,
      displayName: input.displayName,
      enabled: input.enabled,
      config: input.config,
      secretRef,
      isDefault: input.isDefault,
    });

    if (saved.enabled) {
      await this.registerMobileProvider(saved);
    }
    return saved;
  }

  checkProviderHealth(providerId: string) {
    return this.registry.getOrThrow(providerId).healthCheck();
  }

  listProviderModels(providerId: string) {
    return this.registry.getOrThrow(providerId).listModels();
  }

  captureExamPhoto(source: 'camera' | 'gallery'): Promise<CapturedImageAttachment | null> {
    return this.capturePhotoFn(source);
  }

  /**
   * One-click bidirectional study profile sync with the Desktop Companion Bridge.
   * Applies timestamp-safe conflict resolution to keep newest courses & mastery records.
   */
  async syncWithCompanion(baseUrl: string, pairingToken: string): Promise<CompanionSyncResponse> {
    const companion = new CompanionBridgeProvider({
      baseUrl,
      pairingToken,
      fetchFn: this.fetchFn,
    });

    const localCourses = await this.storage.courses.listAll();
    const localMastery: MasteryRecordModel[] = [];
    for (const c of localCourses) {
      localMastery.push(...(await this.storage.mastery.listByCourse(c.id)));
    }

    const response = await companion.syncData({
      deviceId: this.deviceId,
      lastSyncedAt: 0,
      courses: localCourses.map((c) => ({
        id: c.id,
        updatedAt: c.updatedAt,
        payload: c as unknown as Record<string, unknown>,
      })),
      lessons: [],
      masteryRecords: localMastery.map((m) => ({
        id: m.id,
        updatedAt: m.updatedAt,
        payload: m as unknown as Record<string, unknown>,
      })),
      practiceAttempts: [],
    });

    // Apply newer remote courses locally
    const localCourseMap = new Map(localCourses.map((c) => [c.id, c]));
    for (const remote of response.merged.courses) {
      const existing = localCourseMap.get(remote.id);
      const data = remote.payload as Partial<CourseModel>;
      if (!existing && data.title && data.examType) {
        await this.storage.courses.create({
          id: remote.id,
          title: data.title,
          examType: data.examType,
          targetScore: data.targetScore ?? null,
          prepTime: data.prepTime ?? null,
          teachingStyle: data.teachingStyle ?? 'coach',
          detailLevel: data.detailLevel ?? 'standard',
          now: remote.updatedAt,
        });
      } else if (existing && remote.updatedAt > existing.updatedAt) {
        await this.storage.courses.update(remote.id, {
          title: data.title,
          teachingStyle: data.teachingStyle,
          detailLevel: data.detailLevel,
          now: remote.updatedAt,
        });
      }
    }

    // Apply newer remote mastery records locally
    for (const remoteM of response.merged.masteryRecords) {
      const data = remoteM.payload as Partial<MasteryRecordModel>;
      if (!data.courseId || !data.knowledgePoint) continue;
      const existing = await this.storage.mastery.findByKnowledgePoint(
        data.courseId,
        data.knowledgePoint
      );
      if (!existing || remoteM.updatedAt > existing.updatedAt) {
        await this.storage.mastery.upsert({
          id: remoteM.id,
          courseId: data.courseId,
          knowledgePoint: data.knowledgePoint,
          score: data.score ?? 0,
          status: data.status ?? 'unlearned',
          errorTags: data.errorTags ?? [],
          pitfallMemo: data.pitfallMemo ?? null,
          reviewCount: data.reviewCount ?? 0,
          lastReviewedLessonIndex: data.lastReviewedLessonIndex ?? null,
          updatedAt: remoteM.updatedAt,
        });
      }
    }

    return response;
  }
}
