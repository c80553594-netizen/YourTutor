import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import { type GradingResult, type LessonModel } from '@yourtutor/core';
import { MarkdownMathRenderer } from '../../components/MarkdownMathRenderer.js';
import { Badge, Button, Card } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';

export interface QuizCardProps {
  courseId: string;
  lessonId?: string;
  knowledgePoints: string[];
  questionStem: string;
  scoringPoints: string[];
  providerId?: string;
  model?: string;
  onGraded?: (result: { grading: GradingResult; unlockedLesson?: LessonModel | null }) => void;
  onAdvanceLesson?: (lessonId: string) => void;
}

export function QuizCard({
  courseId,
  lessonId,
  knowledgePoints,
  questionStem,
  scoringPoints,
  providerId,
  model,
  onGraded,
  onAdvanceLesson,
}: QuizCardProps): React.ReactElement {
  const { bridge, t } = useAppBridge();
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    grading: GradingResult;
    unlockedLesson?: LessonModel | null;
  } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!answer.trim()) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const graded = await bridge.gradeAnswer({
        courseId,
        lessonId,
        knowledgePoints,
        questionStem,
        scoringPoints,
        studentAnswer: answer.trim(),
        providerId,
        model,
      });
      setResult({ grading: graded.grading, unlockedLesson: graded.unlockedLesson });
      onGraded?.({ grading: graded.grading, unlockedLesson: graded.unlockedLesson });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="space-y-3 border-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
          <span className="text-xs font-bold">{t.quizCardTitle}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {knowledgePoints.map((kp) => (
            <Badge key={kp} tone="accent">
              {kp}
            </Badge>
          ))}
        </div>
      </div>

      <MarkdownMathRenderer content={questionStem} />

      <textarea
        rows={4}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={t.yourAnswerPlaceholder}
        className="w-full rounded-lg border p-3 text-sm outline-none"
        style={{
          backgroundColor: 'var(--yt-bg-primary)',
          borderColor: 'var(--yt-border-strong)',
          color: 'var(--yt-text-primary)',
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'var(--yt-text-muted)' }}>
          {scoringPoints.length} rubric checkpoints
        </span>
        <Button disabled={submitting || !answer.trim()} onClick={() => void handleSubmit()}>
          {submitting ? t.gradingInProgress : t.submitForGrading}
        </Button>
      </div>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--yt-mastery-weak-bg)',
            color: 'var(--yt-mastery-weak)',
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          className="space-y-3 rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--yt-bg-elevated)',
            borderColor: 'var(--yt-border-strong)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--yt-text-secondary)' }}>
                {t.examScoreLabel}:
              </span>
              <span className="text-lg font-bold">
                {result.grading.score} / {result.grading.maxScore}
              </span>
            </div>
            <Badge tone={result.grading.passed ? 'mastered' : 'consolidating'}>
              {result.grading.passed ? t.passedBadge : t.needsRemediationBadge}
            </Badge>
          </div>

          <p className="text-xs leading-relaxed">{result.grading.diagnosis}</p>

          {result.grading.missedPoints.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: 'var(--yt-mastery-weak)' }}>
                {t.missedPointsLabel}:
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {result.grading.missedPoints.map((mp, idx) => (
                  <li key={idx}>{mp}</li>
                ))}
              </ul>
            </div>
          )}

          <div
            className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
            style={{
              backgroundColor: 'var(--yt-mastery-consolidating-bg)',
              color: 'var(--yt-text-primary)',
            }}
          >
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: 'var(--yt-mastery-consolidating)' }}
            />
            <div>
              <span className="font-semibold">{t.pitfallMemoLabel}: </span>
              <span>{result.grading.pitfallMemo}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSolution((prev) => !prev)}
            >
              {showSolution ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>{t.highScoreSolutionToggle}</span>
            </Button>

            {result.grading.passed && result.unlockedLesson && (
              <Button
                size="sm"
                onClick={() => onAdvanceLesson?.(result.unlockedLesson!.id)}
              >
                <span>{t.unlockNextLesson}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {showSolution && (
            <div
              className="rounded-lg border p-3"
              style={{
                backgroundColor: 'var(--yt-bg-surface)',
                borderColor: 'var(--yt-border)',
              }}
            >
              <MarkdownMathRenderer content={result.grading.highScoreSolution} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
