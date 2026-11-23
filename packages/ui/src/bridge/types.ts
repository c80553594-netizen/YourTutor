import {
  type CompanionSyncResponse,
  type CourseModel,
  type CurriculumPlan,
  type DetailLevel,
  type ErrorTag,
  type ExamItemModel,
  type GeneratedDrillSet,
  type GradingResult,
  type LessonMessageModel,
  type LessonModel,
  type MasteryRecordModel,
  type ModelInfo,
  type PracticeAttemptModel,
  type ProviderCapabilities,
  type ProviderConfigModel,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type ReverseEngineeringAnalysis,
  type TeachingStyle,
} from '@yourtutor/core';

export type HostPlatform = 'desktop-electron' | 'mobile-android' | 'web-preview';

export interface HostCapabilities {
  platform: HostPlatform;
  supportsLocalCli: boolean;
  supportsCompanionServer: boolean;
  supportsCameraCapture: boolean;
  supportsClipboardImagePaste: boolean;
}

export interface CompanionServerStatus {
  running: boolean;
  host?: string;
  port?: number;
  baseUrl?: string;
  pairingToken?: string;
  qrPayload?: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  enabled: boolean;
  isDefault: boolean;
}

export interface CapturedImageAttachment {
  path?: string;
  mimeType: string;
  dataBase64: string;
  fileName?: string;
}

export interface StreamSubscription {
  unsubscribe: () => void;
  abort: () => void;
}

/**
 * Universal host-UI boundary contract (`AppBridge`).
 *
 * UI components in `packages/ui` ONLY communicate with storage, providers, OS keychain/keystore,
 * camera/clipboard, and Companion Bridge through this interface:
 * - Desktop (`apps/desktop`): Implemented via Electron Preload IPC (`contextIsolation: true`).
 * - Web Preview (`pnpm dev:web`): Implemented via in-memory MockAppBridge with sample exam data.
 * - Android (`apps/mobile`): Implemented via Capacitor SQLite + Keystore + Camera + Companion client.
 */
export interface AppBridge {
  getHostCapabilities(): Promise<HostCapabilities>;

  // --- Courses & Syllabus ---
  listCourses(): Promise<CourseModel[]>;
  getCourse(courseId: string): Promise<CourseModel | null>;
  createCourse(input: {
    title: string;
    examType: string;
    targetScore?: string;
    prepTime?: string;
    teachingStyle?: TeachingStyle;
    customStylePrompt?: string;
    detailLevel?: DetailLevel;
    packId?: string;
  }): Promise<CourseModel>;
  updateCourseSettings(
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
  ): Promise<CourseModel>;
  deleteCourse(courseId: string): Promise<void>;

  // --- Exam Import & Stage 1 Reverse-Engineering ---
  importAndAnalyzeExam(input: {
    courseId: string;
    rawText: string;
    images?: CapturedImageAttachment[];
    providerId?: string;
    model?: string;
  }): Promise<{ item: ExamItemModel; analysis: ReverseEngineeringAnalysis }>;
  listExamItems(courseId: string): Promise<ExamItemModel[]>;

  // --- Stage 2 Curriculum Planning ---
  generateCurriculum(input: {
    courseId: string;
    providerId?: string;
    model?: string;
  }): Promise<{ plan: CurriculumPlan; lessons: LessonModel[] }>;
  replanRemainingCurriculum(input: {
    courseId: string;
    providerId?: string;
    model?: string;
  }): Promise<LessonModel[]>;
  listLessons(courseId: string): Promise<LessonModel[]>;

  // --- Stage 3 Progressive Classroom ---
  listLessonMessages(lessonId: string): Promise<LessonMessageModel[]>;
  streamLessonTurn(
    input: {
      courseId: string;
      lessonId: string;
      userInput?: string;
      providerId?: string;
      model?: string;
    },
    onEvent: (event: ProviderStreamEvent) => void
  ): StreamSubscription;

  // --- Stage 4 Grading, Mastery & Targeted Drills ---
  gradeAnswer(input: {
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
  }>;
  listMasteryRecords(courseId: string): Promise<MasteryRecordModel[]>;
  listPracticeAttempts(courseId: string): Promise<PracticeAttemptModel[]>;
  generateTargetedDrills(input: {
    courseId: string;
    selectedKnowledgePoints?: string[];
    focusErrorTag?: ErrorTag;
    count?: number;
    providerId?: string;
    model?: string;
  }): Promise<GeneratedDrillSet>;

  // --- Providers & Encrypted Credentials ---
  listProviders(): Promise<ProviderSummary[]>;
  listProviderConfigs(): Promise<ProviderConfigModel[]>;
  saveProviderConfig(input: {
    id: string;
    providerType: string;
    displayName: string;
    enabled: boolean;
    config: Record<string, unknown>;
    /** Plaintext secret passed once over IPC/bridge; host encrypts in keychain/keystore and stores only secretRef. */
    secretValue?: string;
    isDefault?: boolean;
  }): Promise<ProviderConfigModel>;
  checkProviderHealth(providerId: string): Promise<ProviderHealthResult>;
  listProviderModels(providerId: string): Promise<ModelInfo[]>;

  // --- Companion Bridge (Desktop Server / Mobile Client) ---
  getCompanionServerStatus?(): Promise<CompanionServerStatus>;
  setCompanionServerEnabled?(enabled: boolean): Promise<CompanionServerStatus>;
  syncWithCompanion?(baseUrl: string, pairingToken: string): Promise<CompanionSyncResponse>;

  // --- Optional Platform Media Capture ---
  captureExamPhoto?(source: 'camera' | 'gallery'): Promise<CapturedImageAttachment | null>;
}
