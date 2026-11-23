import {
  AnthropicApiProvider,
  AntigravityCliProvider,
  ClaudeCodeCliProvider,
  CodexCliProvider,
  CompanionBridgeProvider,
  type CompanionSyncRequest,
  type CompanionSyncResponse,
  type CourseModel,
  CurriculumPlannerService,
  type CurriculumPlan,
  type DetailLevel,
  type ErrorTag,
  type ExamItemModel,
  GeminiApiProvider,
  type GeneratedDrillSet,
  GradingAndDrillService,
  type GradingResult,
  type LessonMessageModel,
  type LessonModel,
  LessonTutorService,
  type MasteryRecordModel,
  type ModelInfo,
  OpenAICompatibleProvider,
  type PracticeAttemptModel,
  type ProviderConfigModel,
  type ProviderHealthResult,
  ProviderRegistry,
  type ProviderStreamEvent,
  type ReverseEngineeringAnalysis,
  ReverseEngineerService,
  type TeachingStyle,
} from '@yourtutor/core';
import { type TutorStorage } from '@yourtutor/storage';
import {
  type CapturedImageAttachment,
  type CompanionServerStatus,
  type HostCapabilities,
  type ProviderSummary,
} from '@yourtutor/ui';
import { CompanionBridgeServer } from './companion-server.js';
import { type SecretStore } from './secret-store.js';

export interface DesktopTutorControllerOptions {
  storage: TutorStorage;
  secretStore: SecretStore;
  registry?: ProviderRegistry;
  companionPort?: number;
}

/**
 * Main-process application controller backing Electron IPC and the Companion Bridge server.
 * Orchestrates `@yourtutor/core` services, `@yourtutor/storage`, encrypted secrets, and providers.
 */
export class DesktopTutorController {
  readonly storage: TutorStorage;
  readonly registry: ProviderRegistry;
  readonly companionServer: CompanionBridgeServer;

  private readonly secretStore: SecretStore;
  private readonly reverseEngineer = new ReverseEngineerService();
  private readonly curriculumPlanner = new CurriculumPlannerService();
  private readonly lessonTutor = new LessonTutorService();
  private readonly gradingAndDrill = new GradingAndDrillService();

  constructor(options: DesktopTutorControllerOptions) {
    this.storage = options.storage;
    this.secretStore = options.secretStore;
    this.registry = options.registry ?? new ProviderRegistry();

    // Register built-in desktop CLI providers by default
    if (this.registry.list().length === 0) {
      this.registry.register(new AntigravityCliProvider(), { setAsDefault: true });
      this.registry.register(new CodexCliProvider());
      this.registry.register(new ClaudeCodeCliProvider());
    }

    this.companionServer = new CompanionBridgeServer({
      registry: this.registry,
      port: options.companionPort ?? 48720,
      onSync: (payload) => this.handleIncomingSync(payload),
    });
  }

  async initializeFromStoredConfigs(): Promise<void> {
    const saved = await this.storage.providerConfigs.listAll();
    for (const cfg of saved) {
      if (!cfg.enabled) continue;
      await this.registerProviderFromConfig(cfg);
    }
  }

  private async registerProviderFromConfig(cfg: ProviderConfigModel): Promise<void> {
    const secret = cfg.secretRef ? await this.secretStore.getSecret(cfg.secretRef) : null;
    const baseUrl = typeof cfg.config.baseUrl === 'string' ? cfg.config.baseUrl : '';
    const defaultModel =
      typeof cfg.config.defaultModel === 'string' ? cfg.config.defaultModel : 'gpt-4o-mini';

    if (cfg.providerType === 'openai-compatible' && baseUrl) {
      this.registry.register(
        new OpenAICompatibleProvider({
          id: cfg.id,
          name: cfg.displayName,
          baseUrl,
          apiKey: secret ?? undefined,
          defaultModel,
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
        }),
        { setAsDefault: cfg.isDefault }
      );
    }
  }

  getHostCapabilities(): HostCapabilities {
    return {
      platform: 'desktop-electron',
      supportsLocalCli: true,
      supportsCompanionServer: true,
      supportsCameraCapture: false,
      supportsClipboardImagePaste: true,
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
      imagePaths: input.images?.map((i) => i.path ?? i.fileName ?? 'clipboard-image') ?? [],
      analysis,
      orderIndex: existing.length,
    });

    // Seed initial unlearned mastery records from extracted knowledge points
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
  }): Promise<{ plan: CurriculumPlan; lessons: LessonModel[] }> {
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

  listLessons(courseId: string): Promise<LessonModel[]> {
    return this.storage.lessons.listByCourse(courseId);
  }

  listLessonMessages(lessonId: string): Promise<LessonMessageModel[]> {
    return this.storage.messages.listByLesson(lessonId);
  }

  async *streamLessonTurn(
    input: {
      courseId: string;
      lessonId: string;
      userInput?: string;
      providerId?: string;
      model?: string;
    },
    signal?: AbortSignal
  ): AsyncIterable<ProviderStreamEvent> {
    const [course, lessons, lesson, history, masteryRecords, examItems] = await Promise.all([
      this.storage.courses.findById(input.courseId),
      this.storage.lessons.listByCourse(input.courseId),
      this.storage.lessons.findById(input.lessonId),
      this.storage.messages.listByLesson(input.lessonId),
      this.storage.mastery.listByCourse(input.courseId),
      this.storage.examItems.listByCourse(input.courseId),
    ]);

    if (!course || !lesson) {
      yield {
        type: 'error',
        error: { code: 'UNKNOWN', message: 'Course or lesson not found.' },
      };
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
    const relatedExamItems = examItems.filter(
      (e) => lesson.examItemIds.length === 0 || lesson.examItemIds.includes(e.id)
    );

    let fullAssistantText = '';
    for await (const event of this.lessonTutor.streamLessonTurn({
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
      relatedExamItems,
      history,
      userInput: input.userInput,
      provider,
      model: input.model,
      signal,
    })) {
      if (event.type === 'text_delta') {
        fullAssistantText += event.text;
      }
      yield event;
    }

    if (fullAssistantText.trim().length > 0) {
      await this.storage.messages.append({
        courseId: course.id,
        lessonId: lesson.id,
        role: 'assistant',
        content: fullAssistantText,
        cardType: 'lecture',
        providerId: provider.id,
        model: input.model ?? null,
      });
    }
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
  }): Promise<{
    grading: GradingResult;
    updatedMastery: MasteryRecordModel[];
    attempt: PracticeAttemptModel;
    unlockedLesson?: LessonModel | null;
  }> {
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

  listMasteryRecords(courseId: string): Promise<MasteryRecordModel[]> {
    return this.storage.mastery.listByCourse(courseId);
  }

  listPracticeAttempts(courseId: string): Promise<PracticeAttemptModel[]> {
    return this.storage.practiceAttempts.listByCourse(courseId);
  }

  async generateTargetedDrills(input: {
    courseId: string;
    selectedKnowledgePoints?: string[];
    focusErrorTag?: ErrorTag;
    count?: number;
    providerId?: string;
    model?: string;
  }): Promise<GeneratedDrillSet> {
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

  listProviders(): ProviderSummary[] {
    const defaultId = this.registry.getDefault()?.id;
    return this.registry.list().map((provider) => ({
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
      await this.registerProviderFromConfig(saved);
    }
    return saved;
  }

  checkProviderHealth(providerId: string): Promise<ProviderHealthResult> {
    return this.registry.getOrThrow(providerId).healthCheck();
  }

  listProviderModels(providerId: string): Promise<ModelInfo[]> {
    return this.registry.getOrThrow(providerId).listModels();
  }

  getCompanionServerStatus(): CompanionServerStatus {
    return this.companionServer.getStatus();
  }

  async setCompanionServerEnabled(enabled: boolean): Promise<CompanionServerStatus> {
    if (enabled) {
      return this.companionServer.start();
    }
    return this.companionServer.stop();
  }

  /**
   * Conflict-safe timestamp merge when Android Companion sends study records to Desktop.
   */
  private async handleIncomingSync(
    payload: CompanionSyncRequest
  ): Promise<CompanionSyncResponse> {
    const localCourses = await this.storage.courses.listAll();
    const localCourseMap = new Map(localCourses.map((c) => [c.id, c]));

    for (const remoteCourse of payload.courses) {
      const existing = localCourseMap.get(remoteCourse.id);
      const data = remoteCourse.payload as Partial<CourseModel>;
      if (!existing && data.title && data.examType) {
        await this.storage.courses.create({
          id: remoteCourse.id,
          title: data.title,
          examType: data.examType,
          targetScore: data.targetScore ?? null,
          prepTime: data.prepTime ?? null,
          teachingStyle: data.teachingStyle ?? 'coach',
          detailLevel: data.detailLevel ?? 'standard',
          now: remoteCourse.updatedAt,
        });
      } else if (existing && remoteCourse.updatedAt > existing.updatedAt) {
        await this.storage.courses.update(remoteCourse.id, {
          title: data.title,
          teachingStyle: data.teachingStyle,
          detailLevel: data.detailLevel,
          now: remoteCourse.updatedAt,
        });
      }
    }

    const updatedCourses = await this.storage.courses.listAll();
    const allMastery: MasteryRecordModel[] = [];
    for (const course of updatedCourses) {
      const recs = await this.storage.mastery.listByCourse(course.id);
      allMastery.push(...recs);
    }

    return {
      serverTime: Date.now(),
      merged: {
        courses: updatedCourses.map((c) => ({
          id: c.id,
          updatedAt: c.updatedAt,
          payload: c as unknown as Record<string, unknown>,
        })),
        lessons: [],
        masteryRecords: allMastery.map((m) => ({
          id: m.id,
          updatedAt: m.updatedAt,
          payload: m as unknown as Record<string, unknown>,
        })),
        practiceAttempts: [],
      },
    };
  }
}
