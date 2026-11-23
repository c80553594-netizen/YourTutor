import { Brain, Play, Send, Square } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  type CourseModel,
  type DetailLevel,
  type LessonMessageModel,
  type LessonModel,
  type ModelInfo,
  type TeachingStyle,
} from '@yourtutor/core';
import { type ProviderSummary, type StreamSubscription } from '../../bridge/types.js';
import { MarkdownMathRenderer } from '../../components/MarkdownMathRenderer.js';
import { Badge, Button, Card } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';
import { QuizCard } from './QuizCard.js';

export interface ClassroomViewProps {
  course: CourseModel | null;
  lesson: LessonModel | null;
  messages: LessonMessageModel[];
  providers: ProviderSummary[];
  selectedProviderId: string;
  models: ModelInfo[];
  selectedModel: string;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (modelId: string) => void;
  onUpdateTeachingConfig: (patch: {
    teachingStyle?: TeachingStyle;
    customStylePrompt?: string | null;
    detailLevel?: DetailLevel;
  }) => void;
  onMessagesChanged: () => void;
  onMasteryOrLessonUpdated: () => void;
  onSelectLesson: (lessonId: string) => void;
}

const STYLE_OPTIONS: Array<{ value: TeachingStyle; labelZh: string; labelEn: string }> = [
  { value: 'coach', labelZh: 'A. 名师提分风', labelEn: 'A. Exam Coach' },
  { value: 'gentle', labelZh: 'B. 温柔家教风', labelEn: 'B. Gentle Tutor' },
  { value: 'socratic', labelZh: 'C. 苏格拉底启发', labelEn: 'C. Socratic' },
  { value: 'humorous', labelZh: 'D. 幽默类比风', labelEn: 'D. Humorous' },
  { value: 'academic', labelZh: 'E. 严谨学术风', labelEn: 'E. Academic' },
  { value: 'custom', labelZh: '自定义风格', labelEn: 'Custom' },
];

const DETAIL_OPTIONS: Array<{ value: DetailLevel; labelZh: string; labelEn: string }> = [
  { value: 'concise', labelZh: '精简提分', labelEn: 'Concise' },
  { value: 'standard', labelZh: '标准详尽', labelEn: 'Standard' },
  { value: 'zero_base', labelZh: '保姆级零基础', labelEn: 'Zero-Base' },
];

export function ClassroomView({
  course,
  lesson,
  messages,
  providers,
  selectedProviderId,
  models,
  selectedModel,
  onSelectProvider,
  onSelectModel,
  onUpdateTeachingConfig,
  onMessagesChanged,
  onMasteryOrLessonUpdated,
  onSelectLesson,
}: ClassroomViewProps): React.ReactElement {
  const { bridge, locale, t } = useAppBridge();
  const [composer, setComposer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [customStyleDraft, setCustomStyleDraft] = useState(course?.customStylePrompt ?? '');
  const subscriptionRef = useRef<StreamSubscription | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCustomStyleDraft(course?.customStylePrompt ?? '');
  }, [course?.customStylePrompt, course?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamText]);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, []);

  if (!course || !lesson) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm" style={{ color: 'var(--yt-text-muted)' }}>
        {t.noCoursesYet}
      </div>
    );
  }

  const startStream = (userInput?: string) => {
    subscriptionRef.current?.unsubscribe();
    setStreamError(null);
    setStreamText('');
    setStreamThinking('');
    setStreaming(true);

    const sub = bridge.streamLessonTurn(
      {
        courseId: course.id,
        lessonId: lesson.id,
        userInput,
        providerId: selectedProviderId || undefined,
        model: selectedModel || undefined,
      },
      (event) => {
        if (event.type === 'text_delta') {
          setStreamText((prev) => prev + event.text);
        } else if (event.type === 'thinking_delta') {
          setStreamThinking((prev) => prev + event.text);
        } else if (event.type === 'error') {
          setStreamError(event.error.message);
          setStreaming(false);
        } else if (event.type === 'done') {
          setStreaming(false);
          setStreamText('');
          setStreamThinking('');
          onMessagesChanged();
        }
      }
    );
    subscriptionRef.current = sub;
  };

  const handleSend = () => {
    const text = composer.trim();
    if (!text || streaming) {
      return;
    }
    setComposer('');
    startStream(text);
  };

  const handleAbort = () => {
    subscriptionRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Persistent Top Live Teaching Control Bar */}
      <div
        className="shrink-0 space-y-2 border-b px-3 py-2.5"
        style={{
          backgroundColor: 'var(--yt-bg-surface)',
          borderColor: 'var(--yt-border)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">
              L{lesson.orderIndex}. {lesson.title}
            </div>
            <div className="truncate text-[11px]" style={{ color: 'var(--yt-text-muted)' }}>
              {lesson.objective}
            </div>
          </div>
          {messages.length === 0 && !streaming && (
            <Button size="sm" onClick={() => startStream(undefined)}>
              <Play className="h-3.5 w-3.5" />
              <span>{t.startLessonBtn}</span>
            </Button>
          )}
        </div>

        {/* Real-time Provider / Model / Style / Detail Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label={t.providerLabel}
            value={selectedProviderId}
            onChange={(e) => onSelectProvider(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
              color: 'var(--yt-text-primary)',
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {models.length > 0 && (
            <select
              aria-label={t.modelLabel}
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="max-w-[170px] truncate rounded-lg border px-2 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label={t.styleLabel}
            value={course.teachingStyle}
            onChange={(e) =>
              onUpdateTeachingConfig({ teachingStyle: e.target.value as TeachingStyle })
            }
            className="rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
              color: 'var(--yt-text-primary)',
            }}
          >
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {locale === 'zh-CN' ? opt.labelZh : opt.labelEn}
              </option>
            ))}
          </select>

          {/* 3-Segment Detail Level Switch */}
          <div
            className="inline-flex rounded-lg border p-0.5"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
            }}
          >
            {DETAIL_OPTIONS.map((opt) => {
              const active = course.detailLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateTeachingConfig({ detailLevel: opt.value })}
                  className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--yt-accent)' : 'transparent',
                    color: active ? 'var(--yt-accent-foreground)' : 'var(--yt-text-secondary)',
                  }}
                >
                  {locale === 'zh-CN' ? opt.labelZh : opt.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {course.teachingStyle === 'custom' && (
          <div className="flex gap-2">
            <input
              value={customStyleDraft}
              onChange={(e) => setCustomStyleDraft(e.target.value)}
              placeholder="输入自定义讲课风格要求..."
              className="flex-1 rounded-lg border px-2.5 py-1 text-xs outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUpdateTeachingConfig({ customStylePrompt: customStyleDraft })}
            >
              {t.saveConfigBtn}
            </Button>
          </div>
        )}
      </div>

      {/* Classroom Conversation Feed */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const quizMeta =
            msg.cardType === 'quiz' && msg.metadata
              ? {
                  stem:
                    typeof msg.metadata.questionStem === 'string'
                      ? msg.metadata.questionStem
                      : msg.content,
                  scoringPoints: Array.isArray(msg.metadata.scoringPoints)
                    ? (msg.metadata.scoringPoints as string[])
                    : ['写出关键条件与定义域', '完整推导步骤', '明确结论'],
                  knowledgePoints: Array.isArray(msg.metadata.knowledgePoints)
                    ? (msg.metadata.knowledgePoints as string[])
                    : lesson.knowledgePoints,
                }
              : null;

          if (quizMeta) {
            return (
              <QuizCard
                key={msg.id}
                courseId={course.id}
                lessonId={lesson.id}
                knowledgePoints={quizMeta.knowledgePoints}
                questionStem={quizMeta.stem}
                scoringPoints={quizMeta.scoringPoints}
                providerId={selectedProviderId || undefined}
                model={selectedModel || undefined}
                onGraded={() => onMasteryOrLessonUpdated()}
                onAdvanceLesson={(nextId) => onSelectLesson(nextId)}
              />
            );
          }

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-full sm:max-w-[88%] rounded-xl border px-3.5 py-3"
                style={{
                  backgroundColor: isUser ? 'var(--yt-accent-soft)' : 'var(--yt-bg-surface)',
                  borderColor: isUser ? 'var(--yt-accent)' : 'var(--yt-border)',
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold" style={{ color: 'var(--yt-text-secondary)' }}>
                    {isUser ? 'You' : 'YourTutor'}
                  </span>
                  {!isUser && msg.providerId && (
                    <Badge tone="neutral">
                      {msg.providerId}
                      {msg.model ? ` · ${msg.model}` : ''}
                    </Badge>
                  )}
                </div>
                <MarkdownMathRenderer content={msg.content} />
              </div>
            </div>
          );
        })}

        {/* Active Streaming Bubble */}
        {streaming && (
          <Card className="space-y-2">
            {streamThinking && (
              <details
                className="rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--yt-bg-elevated)',
                  borderColor: 'var(--yt-border)',
                }}
              >
                <summary className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <Brain className="h-3.5 w-3.5" style={{ color: 'var(--yt-accent)' }} />
                  <span>{t.thinkingProcess}</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap" style={{ color: 'var(--yt-text-secondary)' }}>
                  {streamThinking}
                </p>
              </details>
            )}
            <MarkdownMathRenderer content={streamText || '...'} />
          </Card>
        )}

        {streamError && (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--yt-mastery-weak-bg)',
              borderColor: 'var(--yt-mastery-weak)',
              color: 'var(--yt-mastery-weak)',
            }}
          >
            {streamError}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer Input Bar (mobile keyboard friendly) */}
      <div
        className="shrink-0 border-t p-3"
        style={{
          backgroundColor: 'var(--yt-bg-surface)',
          borderColor: 'var(--yt-border)',
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.askTutorPlaceholder}
            className="min-h-[44px] flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
              color: 'var(--yt-text-primary)',
            }}
          />
          {streaming ? (
            <Button variant="danger" onClick={handleAbort}>
              <Square className="h-4 w-4" />
              <span>{t.stopBtn}</span>
            </Button>
          ) : (
            <Button disabled={!composer.trim()} onClick={handleSend}>
              <Send className="h-4 w-4" />
              <span>{t.sendBtn}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
