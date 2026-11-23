import {
  BookOpen,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import React from 'react';
import { type CourseModel, type LessonModel } from '@yourtutor/core';
import { Badge, Button } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';
import { type ToolPanelDefinition } from '../../registry/types.js';

export interface SyllabusPanelProps {
  courses: CourseModel[];
  activeCourseId: string | null;
  lessons: LessonModel[];
  activeLessonId: string | null;
  replanning: boolean;
  extraTools?: ToolPanelDefinition[];
  onSelectCourse: (courseId: string) => void;
  onSelectLesson: (lessonId: string) => void;
  onStartNewImport: () => void;
  onReplanRemaining: () => void;
  onDeleteCourse: (courseId: string) => void;
  onSelectTool?: (toolId: string) => void;
}

export function SyllabusPanel({
  courses,
  activeCourseId,
  lessons,
  activeLessonId,
  replanning,
  extraTools = [],
  onSelectCourse,
  onSelectLesson,
  onStartNewImport,
  onReplanRemaining,
  onDeleteCourse,
  onSelectTool,
}: SyllabusPanelProps): React.ReactElement {
  const { t } = useAppBridge();
  const activeCourse = courses.find((c) => c.id === activeCourseId) ?? null;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 shrink-0" style={{ color: 'var(--yt-accent)' }} />
          <h2 className="truncate text-sm font-semibold">{t.navSyllabus}</h2>
        </div>
        <Button size="sm" onClick={onStartNewImport}>
          <Plus className="h-3.5 w-3.5" />
          <span>{t.newExamCourse}</span>
        </Button>
      </div>

      {/* Course Selector */}
      {courses.length === 0 ? (
        <div
          className="rounded-lg border border-dashed p-4 text-center text-xs"
          style={{ borderColor: 'var(--yt-border-strong)', color: 'var(--yt-text-muted)' }}
        >
          {t.noCoursesYet}
        </div>
      ) : (
        <div className="space-y-1.5">
          {courses.map((course) => {
            const isSelected = course.id === activeCourseId;
            return (
              <div
                key={course.id}
                className="group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors cursor-pointer"
                style={{
                  backgroundColor: isSelected ? 'var(--yt-accent-soft)' : 'var(--yt-bg-surface)',
                  borderColor: isSelected ? 'var(--yt-accent)' : 'var(--yt-border)',
                }}
                onClick={() => onSelectCourse(course.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{course.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--yt-text-muted)' }}>
                    <span>{course.examType}</span>
                    {course.targetScore && <span>· {course.targetScore}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete course"
                  aria-label={`Delete ${course.title}`}
                  className="rounded p-1 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCourse(course.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--yt-text-muted)' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Progressive Lesson Tree */}
      {activeCourse && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--yt-text-muted)' }}>
              {lessons.filter((l) => l.status === 'mastered').length}/{lessons.length}{' '}
              {t.lessonMastered}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={replanning || lessons.length === 0}
              onClick={onReplanRemaining}
            >
              <RefreshCw className={`h-3 w-3 ${replanning ? 'animate-spin' : ''}`} />
              <span>{replanning ? t.replanning : t.replanByMastery}</span>
            </Button>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {lessons.map((lesson) => {
              const isSelected = lesson.id === activeLessonId;
              const StatusIcon =
                lesson.status === 'mastered'
                  ? CheckCircle2
                  : lesson.status === 'active'
                    ? PlayCircle
                    : Lock;

              const statusTone =
                lesson.status === 'mastered'
                  ? 'mastered'
                  : lesson.status === 'active'
                    ? 'accent'
                    : 'neutral';

              const statusText =
                lesson.status === 'mastered'
                  ? t.lessonMastered
                  : lesson.status === 'active'
                    ? t.lessonActive
                    : t.lessonLocked;

              return (
                <button
                  key={lesson.id}
                  type="button"
                  disabled={lesson.status === 'locked'}
                  onClick={() => onSelectLesson(lesson.id)}
                  className="w-full rounded-lg border p-2.5 text-left transition-colors disabled:opacity-55 cursor-pointer disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isSelected ? 'var(--yt-bg-elevated)' : 'var(--yt-bg-surface)',
                    borderColor: isSelected ? 'var(--yt-accent)' : 'var(--yt-border)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <StatusIcon
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{
                          color:
                            lesson.status === 'mastered'
                              ? 'var(--yt-mastery-mastered)'
                              : lesson.status === 'active'
                                ? 'var(--yt-accent)'
                                : 'var(--yt-text-muted)',
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold leading-snug">
                          L{lesson.orderIndex}. {lesson.title}
                        </div>
                        <div
                          className="mt-0.5 line-clamp-2 text-[11px]"
                          style={{ color: 'var(--yt-text-secondary)' }}
                        >
                          {lesson.objective}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusTone}>{statusText}</Badge>
                    <Badge tone="neutral">
                      <Clock className="h-3 w-3" />
                      {lesson.estimatedMinutes}m
                    </Badge>
                    {lesson.knowledgePoints.slice(0, 2).map((kp) => (
                      <Badge key={kp} tone="neutral">
                        {kp}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extensible Tool Panel Registry Slot */}
      {extraTools.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: 'var(--yt-border)' }}>
          <div className="flex flex-wrap gap-1.5">
            {extraTools.map((tool) => (
              <Button
                key={tool.id}
                variant="ghost"
                size="sm"
                onClick={() => onSelectTool?.(tool.id)}
              >
                {tool.defaultLabel}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
