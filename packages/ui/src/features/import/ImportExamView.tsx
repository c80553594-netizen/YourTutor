import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  GitBranch,
  ImagePlus,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  type CourseModel,
  type CurriculumPlan,
  type LessonModel,
  type ReverseEngineeringAnalysis,
} from '@yourtutor/core';
import { type CapturedImageAttachment } from '../../bridge/types.js';
import { Badge, Button, Card } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';

export interface ImportExamViewProps {
  selectedProviderId?: string;
  selectedModel?: string;
  onCourseReady: (course: CourseModel, lessons: LessonModel[]) => void;
}

function fileToBase64(file: File): Promise<CapturedImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      resolve({
        mimeType: file.type || 'image/png',
        dataBase64: base64,
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function ImportExamView({
  selectedProviderId,
  selectedModel,
  onCourseReady,
}: ImportExamViewProps): React.ReactElement {
  const { bridge, hostCapabilities, t } = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('高考数学导数含参单调性突破');
  const [examType, setExamType] = useState('高考数学');
  const [targetScore, setTargetScore] = useState('135/150');
  const [prepTime, setPrepTime] = useState('14天冲刺');
  const [rawText, setRawText] = useState(
    '已知函数 f(x) = a ln(x) - x^2 + 2x (a ∈ R)，讨论函数 f(x) 的单调区间。'
  );
  const [images, setImages] = useState<CapturedImageAttachment[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdCourse, setCreatedCourse] = useState<CourseModel | null>(null);
  const [analysis, setAnalysis] = useState<ReverseEngineeringAnalysis | null>(null);
  const [planPreview, setPlanPreview] = useState<CurriculumPlan | null>(null);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) {
      return;
    }
    const added: CapturedImageAttachment[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        added.push(await fileToBase64(file));
      }
    }
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const converted = await Promise.all(files.map(fileToBase64));
    setImages((prev) => [...prev, ...converted]);
    e.target.value = '';
  };

  const handleCameraCapture = async (source: 'camera' | 'gallery') => {
    if (!bridge.captureExamPhoto) {
      return;
    }
    setErrorMsg(null);
    try {
      const photo = await bridge.captureExamPhoto(source);
      if (photo) {
        setImages((prev) => [...prev, photo]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRunAnalysis = async () => {
    if (!rawText.trim() && images.length === 0) {
      return;
    }
    setErrorMsg(null);
    setAnalyzing(true);
    try {
      const course =
        createdCourse ??
        (await bridge.createCourse({
          title: title.trim() || `${examType} 专项提分`,
          examType: examType.trim() || '通用考试',
          targetScore: targetScore.trim() || undefined,
          prepTime: prepTime.trim() || undefined,
        }));
      setCreatedCourse(course);

      const res = await bridge.importAndAnalyzeExam({
        courseId: course.id,
        rawText: rawText.trim(),
        images: images.length > 0 ? images : undefined,
        providerId: selectedProviderId,
        model: selectedModel,
      });
      setAnalysis(res.analysis);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateCurriculum = async () => {
    if (!createdCourse) {
      return;
    }
    setErrorMsg(null);
    setPlanning(true);
    try {
      const { plan, lessons } = await bridge.generateCurriculum({
        courseId: createdCourse.id,
        providerId: selectedProviderId,
        model: selectedModel,
      });
      setPlanPreview(plan);
      onCourseReady(createdCourse, lessons);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-8">
      <div>
        <h1 className="text-lg font-bold tracking-tight">{t.importExamTitle}</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
          {t.importExamSubtitle}
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium" style={{ color: 'var(--yt-text-secondary)' }}>
              {t.courseTitleLabel}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium" style={{ color: 'var(--yt-text-secondary)' }}>
              {t.examTypeLabel}
            </span>
            <input
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium" style={{ color: 'var(--yt-text-secondary)' }}>
              {t.targetScoreLabel}
            </span>
            <input
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium" style={{ color: 'var(--yt-text-secondary)' }}>
              {t.prepTimeLabel}
            </span>
            <input
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            />
          </label>
        </div>

        <div className="space-y-2">
          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onPaste={(e) => void handlePaste(e)}
            placeholder={t.examTextPlaceholder}
            className="w-full rounded-lg border p-3 text-sm leading-relaxed outline-none"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
              color: 'var(--yt-text-primary)',
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {hostCapabilities.supportsCameraCapture && bridge.captureExamPhoto && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCameraCapture('camera')}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{t.capturePhoto}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCameraCapture('gallery')}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>{t.pickFromGallery}</span>
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>{t.uploadImage}</span>
              </Button>
              {hostCapabilities.supportsClipboardImagePaste && (
                <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--yt-text-muted)' }}>
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {t.pasteImageHint}
                </span>
              )}
            </div>

            <Button disabled={analyzing} onClick={() => void handleRunAnalysis()}>
              <Sparkles className="h-4 w-4" />
              <span>{analyzing ? t.analyzingExam : t.analyzeExamBtn}</span>
            </Button>
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {images.map((img, idx) => (
                <div
                  key={`${img.fileName ?? 'img'}-${idx}`}
                  className="relative overflow-hidden rounded-lg border"
                  style={{ borderColor: 'var(--yt-border-strong)' }}
                >
                  <img
                    src={`data:${img.mimeType};base64,${img.dataBase64}`}
                    alt={img.fileName ?? `Exam image ${idx + 1}`}
                    className="h-20 w-28 object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-white"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {errorMsg && (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--yt-mastery-weak-bg)',
              borderColor: 'var(--yt-mastery-weak)',
              color: 'var(--yt-mastery-weak)',
            }}
          >
            {errorMsg}
          </div>
        )}
      </Card>

      {/* 4-Dimensional Reverse-Engineering Result Cards */}
      {analysis && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">{t.reverseEngineeringTitle}</h2>
              <p className="text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
                {analysis.examSummary}
              </p>
            </div>
            <Button disabled={planning} onClick={() => void handleGenerateCurriculum()}>
              <CheckCircle2 className="h-4 w-4" />
              <span>{planning ? t.generatingPlan : t.confirmStartCourseBtn}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* 1. Knowledge Points */}
            <Card className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Target className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
                <span>{t.knowledgePointsHeading}</span>
              </div>
              <div className="space-y-2">
                {analysis.knowledgePoints.map((kp) => (
                  <div
                    key={kp.name}
                    className="rounded-lg p-2.5 text-xs"
                    style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{kp.name}</span>
                      <Badge
                        tone={
                          kp.weight === 'high_frequency'
                            ? 'weak'
                            : kp.weight === 'differentiator'
                              ? 'consolidating'
                              : 'mastered'
                        }
                      >
                        {kp.weight}
                      </Badge>
                    </div>
                    <p className="mt-1" style={{ color: 'var(--yt-text-secondary)' }}>
                      {kp.description}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* 2. Prerequisite Chain */}
            <Card className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <GitBranch className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
                <span>{t.prerequisiteChainHeading}</span>
              </div>
              <div className="space-y-2">
                {analysis.prerequisiteChain.map((node, idx) => (
                  <div
                    key={node.id}
                    className="rounded-lg p-2.5 text-xs"
                    style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {idx + 1}. {node.concept}
                      </span>
                      <Badge tone="accent">{node.level}</Badge>
                    </div>
                    <p className="mt-1" style={{ color: 'var(--yt-text-secondary)' }}>
                      {node.reason}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* 3. Exam Traps */}
            <Card className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle className="h-4 w-4" style={{ color: 'var(--yt-mastery-weak)' }} />
                <span>{t.examTrapsHeading}</span>
              </div>
              <div className="space-y-2">
                {analysis.examTraps.map((trap) => (
                  <div
                    key={trap.title}
                    className="rounded-lg border p-2.5 text-xs"
                    style={{
                      backgroundColor: 'var(--yt-mastery-weak-bg)',
                      borderColor: 'var(--yt-border)',
                    }}
                  >
                    <div className="font-semibold" style={{ color: 'var(--yt-mastery-weak)' }}>
                      {trap.title}
                    </div>
                    <div className="mt-1" style={{ color: 'var(--yt-text-primary)' }}>
                      隐含条件：{trap.hiddenCondition}
                    </div>
                    <div className="mt-0.5" style={{ color: 'var(--yt-text-secondary)' }}>
                      避坑口诀：{trap.avoidanceTip}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 4. Scoring Rubric */}
            <Card className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--yt-mastery-mastered)' }} />
                <span>{t.scoringRubricHeading}</span>
              </div>
              <div className="space-y-2">
                {analysis.scoringRubric.map((rubric) => (
                  <div
                    key={rubric.step}
                    className="rounded-lg p-2.5 text-xs"
                    style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{rubric.step}</span>
                      <Badge tone="mastered">{rubric.weightPercent}%</Badge>
                    </div>
                    <p className="mt-1" style={{ color: 'var(--yt-text-secondary)' }}>
                      {rubric.requirement}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {planPreview && (
        <Card className="space-y-2">
          <div className="text-sm font-bold">{t.curriculumPreviewHeading}</div>
          <p className="text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
            {planPreview.overview}
          </p>
        </Card>
      )}
    </div>
  );
}
