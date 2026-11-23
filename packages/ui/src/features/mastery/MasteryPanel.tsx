import { AlertCircle, Flame, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  type CourseModel,
  type ErrorTag,
  type GeneratedDrillItem,
  type MasteryRecordModel,
} from '@yourtutor/core';
import { Badge, Button, Card, ProgressBar } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';
import { QuizCard } from '../classroom/QuizCard.js';

export interface MasteryPanelProps {
  course: CourseModel | null;
  masteryRecords: MasteryRecordModel[];
  selectedProviderId?: string;
  selectedModel?: string;
  onMasteryUpdated: () => void;
}

const ERROR_TAG_DISPLAY: Record<ErrorTag, { zh: string; en: string }> = {
  concept_gap: { zh: '概念盲区', en: 'Concept Gap' },
  logic_break: { zh: '思路断层', en: 'Logic Break' },
  trap_missed: { zh: '审题踩坑', en: 'Trap Missed' },
  step_deduction: { zh: '步骤丢分', en: 'Step Deduction' },
};

export function MasteryPanel({
  course,
  masteryRecords,
  selectedProviderId,
  selectedModel,
  onMasteryUpdated,
}: MasteryPanelProps): React.ReactElement {
  const { bridge, locale, t } = useAppBridge();
  const [selectedKp, setSelectedKp] = useState<string>('');
  const [focusErrorTag, setFocusErrorTag] = useState<ErrorTag | ''>('');
  const [drillCount, setDrillCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [drills, setDrills] = useState<GeneratedDrillItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const errorCounts = useMemo(() => {
    const counts: Record<ErrorTag, number> = {
      concept_gap: 0,
      logic_break: 0,
      trap_missed: 0,
      step_deduction: 0,
    };
    for (const rec of masteryRecords) {
      for (const tag of rec.errorTags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [masteryRecords]);

  const pitfallMemos = useMemo(
    () =>
      masteryRecords
        .filter((r) => Boolean(r.pitfallMemo?.trim()))
        .map((r) => ({ kp: r.knowledgePoint, memo: r.pitfallMemo!.trim() })),
    [masteryRecords]
  );

  if (!course) {
    return (
      <div className="p-4 text-xs" style={{ color: 'var(--yt-text-muted)' }}>
        {t.noCoursesYet}
      </div>
    );
  }

  const handleGenerateDrills = async (attackWeakest: boolean) => {
    setErrorMsg(null);
    setGenerating(true);
    try {
      const set = await bridge.generateTargetedDrills({
        courseId: course.id,
        selectedKnowledgePoints: !attackWeakest && selectedKp ? [selectedKp] : undefined,
        focusErrorTag: !attackWeakest && focusErrorTag ? focusErrorTag : undefined,
        count: attackWeakest ? 1 : drillCount,
        providerId: selectedProviderId,
        model: selectedModel,
      });
      setDrills(set.drills);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
        <h2 className="text-sm font-semibold">{t.masteryOverviewTitle}</h2>
      </div>

      {/* Knowledge Point Mastery Bars */}
      <Card className="space-y-3 p-3">
        {masteryRecords.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--yt-text-muted)' }}>
            完成首轮随堂诊断小测后，这里将实时生成考点掌握度档案。
          </div>
        ) : (
          masteryRecords.map((rec) => {
            const tone =
              rec.status === 'mastered'
                ? 'mastered'
                : rec.status === 'consolidating'
                  ? 'consolidating'
                  : 'weak';
            return (
              <div key={rec.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{rec.knowledgePoint}</span>
                  <Badge tone={tone}>{rec.score}%</Badge>
                </div>
                <ProgressBar value={rec.score} tone={tone} />
                {rec.errorTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rec.errorTags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {locale === 'zh-CN' ? ERROR_TAG_DISPLAY[tag].zh : ERROR_TAG_DISPLAY[tag].en}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>

      {/* Error Distribution */}
      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <AlertCircle className="h-3.5 w-3.5" style={{ color: 'var(--yt-mastery-weak)' }} />
          <span>{t.errorDistributionTitle}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(errorCounts) as ErrorTag[]).map((tag) => (
            <div
              key={tag}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
            >
              <span>{locale === 'zh-CN' ? ERROR_TAG_DISPLAY[tag].zh : ERROR_TAG_DISPLAY[tag].en}</span>
              <span className="font-bold">{errorCounts[tag]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Personal Pitfall Notebook */}
      {pitfallMemos.length > 0 && (
        <Card className="space-y-2 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" style={{ color: 'var(--yt-mastery-consolidating)' }} />
            <span>{t.pitfallBookTitle}</span>
          </div>
          <div className="space-y-1.5">
            {pitfallMemos.map((item) => (
              <div
                key={item.kp}
                className="rounded-lg p-2 text-xs"
                style={{ backgroundColor: 'var(--yt-mastery-consolidating-bg)' }}
              >
                <div className="font-semibold">{item.kp}</div>
                <div className="mt-0.5" style={{ color: 'var(--yt-text-secondary)' }}>
                  {item.memo}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Targeted Private-Tutor Drill Generator */}
      <Card className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Flame className="h-3.5 w-3.5" style={{ color: 'var(--yt-accent)' }} />
          <span>{t.targetedDrillTitle}</span>
        </div>

        <Button
          className="w-full"
          disabled={generating || masteryRecords.length === 0}
          onClick={() => void handleGenerateDrills(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t.attackWeakestBtn}</span>
        </Button>

        <div className="grid grid-cols-1 gap-2 text-xs">
          <select
            value={selectedKp}
            onChange={(e) => setSelectedKp(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: 'var(--yt-bg-primary)',
              borderColor: 'var(--yt-border-strong)',
              color: 'var(--yt-text-primary)',
            }}
          >
            <option value="">自动匹配最薄弱考点</option>
            {masteryRecords.map((r) => (
              <option key={r.id} value={r.knowledgePoint}>
                {r.knowledgePoint} ({r.score}%)
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={focusErrorTag}
              onChange={(e) => setFocusErrorTag(e.target.value as ErrorTag | '')}
              className="flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            >
              <option value="">按历史错因智能选题</option>
              {(Object.keys(ERROR_TAG_DISPLAY) as ErrorTag[]).map((tag) => (
                <option key={tag} value={tag}>
                  {locale === 'zh-CN' ? ERROR_TAG_DISPLAY[tag].zh : ERROR_TAG_DISPLAY[tag].en}
                </option>
              ))}
            </select>

            <select
              aria-label={t.drillCountLabel}
              value={drillCount}
              onChange={(e) => setDrillCount(Number(e.target.value))}
              className="w-16 rounded-lg border px-2 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: 'var(--yt-bg-primary)',
                borderColor: 'var(--yt-border-strong)',
                color: 'var(--yt-text-primary)',
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 题
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={generating || masteryRecords.length === 0}
            onClick={() => void handleGenerateDrills(false)}
          >
            {t.generateCustomDrillsBtn}
          </Button>
        </div>

        {errorMsg && (
          <div className="text-xs" style={{ color: 'var(--yt-mastery-weak)' }}>
            {errorMsg}
          </div>
        )}
      </Card>

      {/* Rendered Targeted Drill Cards */}
      {drills.map((drill, idx) => (
        <div key={`${drill.knowledgePoint}-${idx}`} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <Badge tone="accent">Strategy: {drill.strategy}</Badge>
            <span style={{ color: 'var(--yt-mastery-consolidating)' }}>{drill.trapWarning}</span>
          </div>
          <QuizCard
            courseId={course.id}
            knowledgePoints={[drill.knowledgePoint]}
            questionStem={drill.stem}
            scoringPoints={drill.scoringPoints}
            providerId={selectedProviderId}
            model={selectedModel}
            onGraded={() => onMasteryUpdated()}
          />
        </div>
      ))}
    </div>
  );
}
