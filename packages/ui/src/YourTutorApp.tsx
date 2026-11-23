import {
  BookOpen,
  GraduationCap,
  Languages,
  Monitor,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Smartphone,
  Sun,
  TrendingUp,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  type CourseModel,
  type DetailLevel,
  type LessonMessageModel,
  type LessonModel,
  type MasteryRecordModel,
  type ModelInfo,
  type TeachingStyle,
} from '@yourtutor/core';
import { type AppBridge, type ProviderSummary } from './bridge/types.js';
import { AppBridgeProvider, useAppBridge } from './context/AppBridgeContext.js';
import { ClassroomView } from './features/classroom/ClassroomView.js';
import { ImportExamView } from './features/import/ImportExamView.js';
import { MasteryPanel } from './features/mastery/MasteryPanel.js';
import { SettingsView } from './features/settings/SettingsView.js';
import { SyllabusPanel } from './features/syllabus/SyllabusPanel.js';
import { type ToolPanelDefinition } from './registry/types.js';

export interface YourTutorAppProps {
  bridge: AppBridge;
  extraTools?: ToolPanelDefinition[];
}

type CenterView = 'classroom' | 'import' | 'settings';
type MobileTab = 'syllabus' | 'classroom' | 'mastery' | 'settings';

function YourTutorShell({ extraTools = [] }: { extraTools?: ToolPanelDefinition[] }): React.ReactElement {
  const { bridge, hostCapabilities, locale, setLocale, theme, setTheme, t } = useAppBridge();

  const [courses, setCourses] = useState<CourseModel[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonModel[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LessonMessageModel[]>([]);
  const [masteryRecords, setMasteryRecords] = useState<MasteryRecordModel[]>([]);

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [centerView, setCenterView] = useState<CenterView>('classroom');
  const [mobileTab, setMobileTab] = useState<MobileTab>('classroom');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [replanning, setReplanning] = useState(false);

  // Cloud web preview viewport toggle (`pnpm dev:web`)
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');

  const loadProviders = useCallback(async () => {
    const list = await bridge.listProviders();
    setProviders(list);
    if (!selectedProviderId && list.length > 0) {
      const def = list.find((p) => p.isDefault) ?? list[0];
      if (def) {
        setSelectedProviderId(def.id);
      }
    }
  }, [bridge, selectedProviderId]);

  const loadCourses = useCallback(async () => {
    const list = await bridge.listCourses();
    setCourses(list);
    setActiveCourseId((prev) => {
      if (prev && list.some((c) => c.id === prev)) {
        return prev;
      }
      return list[0]?.id ?? null;
    });
  }, [bridge]);

  const loadCourseDetails = useCallback(
    async (courseId: string) => {
      const [lessonList, masteryList] = await Promise.all([
        bridge.listLessons(courseId),
        bridge.listMasteryRecords(courseId),
      ]);
      setLessons(lessonList);
      setMasteryRecords(masteryList);
      setActiveLessonId((prev) => {
        if (prev && lessonList.some((l) => l.id === prev)) {
          return prev;
        }
        return (
          lessonList.find((l) => l.status === 'active')?.id ?? lessonList[0]?.id ?? null
        );
      });
    },
    [bridge]
  );

  const loadMessages = useCallback(
    async (lessonId: string) => {
      const msgs = await bridge.listLessonMessages(lessonId);
      setMessages(msgs);
    },
    [bridge]
  );

  useEffect(() => {
    void loadProviders();
    void loadCourses();
  }, [loadProviders, loadCourses]);

  useEffect(() => {
    if (selectedProviderId) {
      void bridge.listProviderModels(selectedProviderId).then((list) => {
        setModels(list);
        setSelectedModel((prev) =>
          prev && list.some((m) => m.id === prev) ? prev : (list[0]?.id ?? '')
        );
      });
    }
  }, [bridge, selectedProviderId]);

  useEffect(() => {
    if (activeCourseId) {
      void loadCourseDetails(activeCourseId);
    } else {
      setLessons([]);
      setMasteryRecords([]);
      setActiveLessonId(null);
    }
  }, [activeCourseId, loadCourseDetails]);

  useEffect(() => {
    if (activeLessonId) {
      void loadMessages(activeLessonId);
    } else {
      setMessages([]);
    }
  }, [activeLessonId, loadMessages]);

  const activeCourse = courses.find((c) => c.id === activeCourseId) ?? null;
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? null;

  const handleUpdateTeachingConfig = async (patch: {
    teachingStyle?: TeachingStyle;
    customStylePrompt?: string | null;
    detailLevel?: DetailLevel;
  }) => {
    if (!activeCourse) return;
    const updated = await bridge.updateCourseSettings(activeCourse.id, patch);
    setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleReplanRemaining = async () => {
    if (!activeCourse) return;
    setReplanning(true);
    try {
      const updatedLessons = await bridge.replanRemainingCurriculum({
        courseId: activeCourse.id,
        providerId: selectedProviderId || undefined,
        model: selectedModel || undefined,
      });
      setLessons(updatedLessons);
    } finally {
      setReplanning(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    await bridge.deleteCourse(courseId);
    await loadCourses();
  };

  const forceMobileFrame =
    hostCapabilities.platform === 'web-preview' && previewViewport === 'mobile';

  const shellContent = (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--yt-bg-primary)', color: 'var(--yt-text-primary)' }}
    >
      {/* Top App Header */}
      <header
        className="yt-safe-pt flex h-12 shrink-0 items-center justify-between border-b px-3"
        style={{
          backgroundColor: 'var(--yt-bg-surface)',
          borderColor: 'var(--yt-border)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--yt-accent)', color: 'var(--yt-accent-foreground)' }}
          >
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight">{t.appTitle}</span>
          <span
            className="hidden truncate text-xs sm:inline"
            style={{ color: 'var(--yt-text-muted)' }}
          >
            · {t.appTagline}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {hostCapabilities.platform === 'web-preview' && (
            <div
              className="hidden items-center rounded-lg border p-0.5 md:flex"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
              }}
            >
              <button
                type="button"
                onClick={() => setPreviewViewport('desktop')}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer"
                style={{
                  backgroundColor:
                    previewViewport === 'desktop' ? 'var(--yt-accent)' : 'transparent',
                  color:
                    previewViewport === 'desktop'
                      ? 'var(--yt-accent-foreground)'
                      : 'var(--yt-text-secondary)',
                }}
              >
                <Monitor className="h-3 w-3" />
                <span>{t.previewViewportDesktop}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport('mobile')}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer"
                style={{
                  backgroundColor:
                    previewViewport === 'mobile' ? 'var(--yt-accent)' : 'transparent',
                  color:
                    previewViewport === 'mobile'
                      ? 'var(--yt-accent-foreground)'
                      : 'var(--yt-text-secondary)',
                }}
              >
                <Smartphone className="h-3 w-3" />
                <span>{t.previewViewportMobile}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            title="Switch Language"
            aria-label="Switch Language"
            onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--yt-border)', color: 'var(--yt-text-secondary)' }}
          >
            <Languages className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="Toggle Theme"
            aria-label="Toggle Theme"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--yt-border)', color: 'var(--yt-text-secondary)' }}
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {!forceMobileFrame && (
            <>
              <button
                type="button"
                title={t.navSettings}
                aria-label={t.navSettings}
                onClick={() =>
                  setCenterView((prev) => (prev === 'settings' ? 'classroom' : 'settings'))
                }
                className="hidden h-8 w-8 items-center justify-center rounded-lg border md:inline-flex cursor-pointer"
                style={{
                  borderColor:
                    centerView === 'settings' ? 'var(--yt-accent)' : 'var(--yt-border)',
                  color:
                    centerView === 'settings' ? 'var(--yt-accent)' : 'var(--yt-text-secondary)',
                }}
              >
                <Settings className="h-4 w-4" />
              </button>

              <button
                type="button"
                title="Toggle Mastery Panel"
                aria-label="Toggle Mastery Panel"
                onClick={() => setRightPanelOpen((prev) => !prev)}
                className="hidden h-8 w-8 items-center justify-center rounded-lg border md:inline-flex cursor-pointer"
                style={{ borderColor: 'var(--yt-border)', color: 'var(--yt-text-secondary)' }}
              >
                {rightPanelOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Responsive Workbench */}
      {!forceMobileFrame ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Desktop Left Column: Syllabus */}
          <aside
            className="hidden w-72 shrink-0 border-r md:block"
            style={{
              backgroundColor: 'var(--yt-bg-surface)',
              borderColor: 'var(--yt-border)',
            }}
          >
            <SyllabusPanel
              courses={courses}
              activeCourseId={activeCourseId}
              lessons={lessons}
              activeLessonId={activeLessonId}
              replanning={replanning}
              extraTools={extraTools}
              onSelectCourse={(id) => {
                setActiveCourseId(id);
                setCenterView('classroom');
              }}
              onSelectLesson={(id) => {
                setActiveLessonId(id);
                setCenterView('classroom');
              }}
              onStartNewImport={() => setCenterView('import')}
              onReplanRemaining={() => void handleReplanRemaining()}
              onDeleteCourse={(id) => void handleDeleteCourse(id)}
            />
          </aside>

          {/* Center Column (Desktop) / Active Mobile Tab (Mobile < 768px) */}
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* Desktop center switching */}
            <div className="hidden h-full md:block">
              {centerView === 'import' ? (
                <div className="h-full overflow-y-auto">
                  <ImportExamView
                    selectedProviderId={selectedProviderId || undefined}
                    selectedModel={selectedModel || undefined}
                    onCourseReady={(course, createdLessons) => {
                      setCourses((prev) => [
                        course,
                        ...prev.filter((c) => c.id !== course.id),
                      ]);
                      setActiveCourseId(course.id);
                      setLessons(createdLessons);
                      setActiveLessonId(createdLessons[0]?.id ?? null);
                      setCenterView('classroom');
                    }}
                  />
                </div>
              ) : centerView === 'settings' ? (
                <div className="h-full overflow-y-auto">
                  <SettingsView
                    providers={providers}
                    onProvidersChanged={() => void loadProviders()}
                  />
                </div>
              ) : (
                <ClassroomView
                  course={activeCourse}
                  lesson={activeLesson}
                  messages={messages}
                  providers={providers}
                  selectedProviderId={selectedProviderId}
                  models={models}
                  selectedModel={selectedModel}
                  onSelectProvider={setSelectedProviderId}
                  onSelectModel={setSelectedModel}
                  onUpdateTeachingConfig={(patch) => void handleUpdateTeachingConfig(patch)}
                  onMessagesChanged={() => {
                    if (activeLessonId) void loadMessages(activeLessonId);
                  }}
                  onMasteryOrLessonUpdated={() => {
                    if (activeCourseId) void loadCourseDetails(activeCourseId);
                  }}
                  onSelectLesson={(id) => setActiveLessonId(id)}
                />
              )}
            </div>

            {/* Mobile narrow-screen layout (< 768px) */}
            <div className="h-full md:hidden">
              {mobileTab === 'syllabus' && (
                <div className="h-full overflow-y-auto">
                  {centerView === 'import' ? (
                    <ImportExamView
                      selectedProviderId={selectedProviderId || undefined}
                      selectedModel={selectedModel || undefined}
                      onCourseReady={(course, createdLessons) => {
                        setCourses((prev) => [
                          course,
                          ...prev.filter((c) => c.id !== course.id),
                        ]);
                        setActiveCourseId(course.id);
                        setLessons(createdLessons);
                        setActiveLessonId(createdLessons[0]?.id ?? null);
                        setCenterView('classroom');
                        setMobileTab('classroom');
                      }}
                    />
                  ) : (
                    <SyllabusPanel
                      courses={courses}
                      activeCourseId={activeCourseId}
                      lessons={lessons}
                      activeLessonId={activeLessonId}
                      replanning={replanning}
                      extraTools={extraTools}
                      onSelectCourse={(id) => {
                        setActiveCourseId(id);
                      }}
                      onSelectLesson={(id) => {
                        setActiveLessonId(id);
                        setCenterView('classroom');
                        setMobileTab('classroom');
                      }}
                      onStartNewImport={() => setCenterView('import')}
                      onReplanRemaining={() => void handleReplanRemaining()}
                      onDeleteCourse={(id) => void handleDeleteCourse(id)}
                    />
                  )}
                </div>
              )}

              {mobileTab === 'classroom' && (
                <ClassroomView
                  course={activeCourse}
                  lesson={activeLesson}
                  messages={messages}
                  providers={providers}
                  selectedProviderId={selectedProviderId}
                  models={models}
                  selectedModel={selectedModel}
                  onSelectProvider={setSelectedProviderId}
                  onSelectModel={setSelectedModel}
                  onUpdateTeachingConfig={(patch) => void handleUpdateTeachingConfig(patch)}
                  onMessagesChanged={() => {
                    if (activeLessonId) void loadMessages(activeLessonId);
                  }}
                  onMasteryOrLessonUpdated={() => {
                    if (activeCourseId) void loadCourseDetails(activeCourseId);
                  }}
                  onSelectLesson={(id) => setActiveLessonId(id)}
                />
              )}

              {mobileTab === 'mastery' && (
                <MasteryPanel
                  course={activeCourse}
                  masteryRecords={masteryRecords}
                  selectedProviderId={selectedProviderId || undefined}
                  selectedModel={selectedModel || undefined}
                  onMasteryUpdated={() => {
                    if (activeCourseId) void loadCourseDetails(activeCourseId);
                  }}
                />
              )}

              {mobileTab === 'settings' && (
                <div className="h-full overflow-y-auto">
                  <SettingsView
                    providers={providers}
                    onProvidersChanged={() => void loadProviders()}
                  />
                </div>
              )}
            </div>
          </main>

          {/* Desktop Right Collapsible Column: Mastery & Drills */}
          {rightPanelOpen && (
            <aside
              className="hidden w-80 shrink-0 border-l md:block"
              style={{
                backgroundColor: 'var(--yt-bg-surface)',
                borderColor: 'var(--yt-border)',
              }}
            >
              <MasteryPanel
                course={activeCourse}
                masteryRecords={masteryRecords}
                selectedProviderId={selectedProviderId || undefined}
                selectedModel={selectedModel || undefined}
                onMasteryUpdated={() => {
                  if (activeCourseId) void loadCourseDetails(activeCourseId);
                }}
              />
            </aside>
          )}
        </div>
      ) : (
        /* Forced 390x844 Mobile Viewport Preview inside dev:web */
        <main className="min-h-0 flex-1 overflow-hidden">
          {mobileTab === 'syllabus' && (
            <div className="h-full overflow-y-auto">
              {centerView === 'import' ? (
                <ImportExamView
                  selectedProviderId={selectedProviderId || undefined}
                  selectedModel={selectedModel || undefined}
                  onCourseReady={(course, createdLessons) => {
                    setCourses((prev) => [
                      course,
                      ...prev.filter((c) => c.id !== course.id),
                    ]);
                    setActiveCourseId(course.id);
                    setLessons(createdLessons);
                    setActiveLessonId(createdLessons[0]?.id ?? null);
                    setCenterView('classroom');
                    setMobileTab('classroom');
                  }}
                />
              ) : (
                <SyllabusPanel
                  courses={courses}
                  activeCourseId={activeCourseId}
                  lessons={lessons}
                  activeLessonId={activeLessonId}
                  replanning={replanning}
                  extraTools={extraTools}
                  onSelectCourse={(id) => setActiveCourseId(id)}
                  onSelectLesson={(id) => {
                    setActiveLessonId(id);
                    setCenterView('classroom');
                    setMobileTab('classroom');
                  }}
                  onStartNewImport={() => setCenterView('import')}
                  onReplanRemaining={() => void handleReplanRemaining()}
                  onDeleteCourse={(id) => void handleDeleteCourse(id)}
                />
              )}
            </div>
          )}
          {mobileTab === 'classroom' && (
            <ClassroomView
              course={activeCourse}
              lesson={activeLesson}
              messages={messages}
              providers={providers}
              selectedProviderId={selectedProviderId}
              models={models}
              selectedModel={selectedModel}
              onSelectProvider={setSelectedProviderId}
              onSelectModel={setSelectedModel}
              onUpdateTeachingConfig={(patch) => void handleUpdateTeachingConfig(patch)}
              onMessagesChanged={() => {
                if (activeLessonId) void loadMessages(activeLessonId);
              }}
              onMasteryOrLessonUpdated={() => {
                if (activeCourseId) void loadCourseDetails(activeCourseId);
              }}
              onSelectLesson={(id) => setActiveLessonId(id)}
            />
          )}
          {mobileTab === 'mastery' && (
            <MasteryPanel
              course={activeCourse}
              masteryRecords={masteryRecords}
              selectedProviderId={selectedProviderId || undefined}
              selectedModel={selectedModel || undefined}
              onMasteryUpdated={() => {
                if (activeCourseId) void loadCourseDetails(activeCourseId);
              }}
            />
          )}
          {mobileTab === 'settings' && (
            <div className="h-full overflow-y-auto">
              <SettingsView
                providers={providers}
                onProvidersChanged={() => void loadProviders()}
              />
            </div>
          )}
        </main>
      )}

      {/* Mobile Bottom Tab Navigation (< 768px OR forced mobile preview) */}
      <nav
        className={`yt-safe-pb shrink-0 border-t ${forceMobileFrame ? 'grid' : 'grid md:hidden'} grid-cols-4`}
        style={{
          backgroundColor: 'var(--yt-bg-surface)',
          borderColor: 'var(--yt-border)',
        }}
      >
        {(
          [
            { id: 'syllabus', label: t.navSyllabus, icon: BookOpen },
            { id: 'classroom', label: t.navClassroom, icon: GraduationCap },
            { id: 'mastery', label: t.navMastery, icon: TrendingUp },
            { id: 'settings', label: t.navSettings, icon: Settings },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = mobileTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMobileTab(item.id);
                if (item.id === 'syllabus') {
                  setCenterView('classroom');
                }
              }}
              className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer"
              style={{ color: active ? 'var(--yt-accent)' : 'var(--yt-text-muted)' }}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  if (forceMobileFrame) {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-auto p-4"
        style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
      >
        <div
          className="overflow-hidden rounded-[28px] border-4 shadow-xl"
          style={{
            width: 390,
            height: 844,
            maxHeight: '95vh',
            borderColor: 'var(--yt-border-strong)',
          }}
        >
          {shellContent}
        </div>
      </div>
    );
  }

  return shellContent;
}

/**
 * Shared cross-platform root UI component mounted by both Electron Desktop (`apps/desktop`)
 * and Capacitor Android (`apps/mobile`) via dependency-injected `AppBridge`.
 */
export function YourTutorApp({ bridge, extraTools }: YourTutorAppProps): React.ReactElement {
  return (
    <AppBridgeProvider bridge={bridge}>
      <YourTutorShell extraTools={extraTools} />
    </AppBridgeProvider>
  );
}
