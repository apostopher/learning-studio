import { useAtom, useSetAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { justSubmittedDebriefAtom } from '#/atoms/debrief';
import { ClientGate } from '#/components/client-gate';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import { useDebriefStatus } from '#/data-hooks/use-debrief-status';
import {
  useCurrentTest,
  useEvaluations,
  useResetTest,
  useTotalScore,
} from '#/hooks/data/use-lesson-ai-test';
import { DEBRIEF_PAR_SCORE, msUntil } from '#/lib/debrief-schedule';
import { formatDebriefTime } from '#/lib/format-debrief-time';
import {
  computeDebriefPanel,
  debriefSessionProgress,
  isStaleDebriefSession,
  settleDebriefPanel,
} from '../compute-debrief-panel';
import { DebriefAttemptHistory } from './debrief-attempt-history';
import { DebriefQuizContainer } from './debrief-quiz-container';
import { DebriefWait } from './debrief-wait';
import { freeTextAnswerAtom, selectedOptionAtom } from './question-card';
import { ScoreReport } from './score-report';

type DebriefPanelContainerProps = {
  courseSlug: string;
  lessonSlug: string;
  /**
   * Completed at an earlier level. Callers do not render a Debrief panel for
   * such a lesson (call 12); passed through so the quiz stays inert if one
   * ever does.
   */
  readOnly: boolean;
};

/**
 * A grace second on the scheduled refetch, so a client clock a moment ahead
 * of the server does not ask before the server agrees the debrief is open.
 */
const REFETCH_GRACE_MS = 1_000;

/** An ISO instant in the pilot's timezone — client-only, see formatDebriefTime. */
const DebriefTime = ({ iso }: { iso: string }) => (
  <ClientGate>{() => formatDebriefTime(iso, new Date())}</ClientGate>
);

/**
 * The Debrief tab: reads this pilot's debrief state and renders the panel
 * `computeDebriefPanel` picks. Every branch lives in that pure module; this
 * only wires hooks to it.
 */
export const DebriefPanelContainer = ({
  courseSlug,
  lessonSlug,
  readOnly,
}: DebriefPanelContainerProps) => {
  const status = useDebriefStatus({ courseSlug, lessonSlug, enabled: true });
  const [justSubmitted, setJustSubmitted] = useAtom(justSubmittedDebriefAtom);
  const session = useCurrentTest();
  const evaluations = useEvaluations();
  const totalScore = useTotalScore();
  const resetTest = useResetTest();
  const setSelectedOption = useSetAtom(selectedOptionAtom);
  const setFreeTextAnswer = useSetAtom(freeTextAnswerAtom);

  const sessionProgress = debriefSessionProgress(
    session,
    evaluations.length,
    lessonSlug,
  );
  const stale = isStaleDebriefSession({
    sessionProgress,
    justSubmittedLessonSlug: justSubmitted,
    lessonSlug,
    status,
  });
  const panel = settleDebriefPanel(
    computeDebriefPanel({
      status,
      justSubmittedLessonSlug: justSubmitted,
      lessonSlug,
      sessionInProgress: sessionProgress === 'in-progress',
    }),
    { sessionProgress, stale },
  );

  // The debrief reopened while this page held the last attempt: clear it so
  // the tab offers the fresh debrief instead of the old report.
  useEffect(() => {
    if (!stale) return;
    resetTest();
    setSelectedOption('');
    setFreeTextAnswer('');
    setJustSubmitted(null);
  }, [
    stale,
    resetTest,
    setSelectedOption,
    setFreeTextAnswer,
    setJustSubmitted,
  ]);

  // Flip the tab the moment the debrief opens, without a reload.
  const availableAt = 'availableAt' in panel ? panel.availableAt : null;
  const { refetch } = status;
  useEffect(() => {
    if (availableAt === null) return;
    const id = setTimeout(
      () => void refetch(),
      msUntil(availableAt, new Date(Date.now() - REFETCH_GRACE_MS)),
    );
    return () => clearTimeout(id);
  }, [availableAt, refetch]);

  switch (panel.kind) {
    case 'loading':
      return (
        // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
        <div
          role="status"
          className="flex items-center gap-2 py-2 text-sm text-secondary"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your debrief…
        </div>
      );
    case 'error':
      return (
        <LessonError
          message="Your debrief's schedule didn't load. Check your connection and try again."
          onRetry={() => void refetch()}
          subject="your debrief"
        />
      );
    case 'not-done':
      return <DebriefWait kind="not-done" outstanding={panel.outstanding} />;
    case 'waiting':
      return (
        <DebriefWait
          kind="waiting"
          time={<DebriefTime iso={panel.availableAt} />}
        />
      );
    case 'retake-waiting':
      return (
        <DebriefWait
          kind="retake-waiting"
          time={<DebriefTime iso={panel.availableAt} />}
        />
      );
    case 'take':
      return (
        <DebriefQuizContainer
          courseSlug={courseSlug}
          lessonSlug={lessonSlug}
          readOnly={readOnly}
          retake={panel.retake}
        />
      );
    case 'just-failed':
      // settleDebriefPanel only keeps just-failed while the session is here.
      return session ? (
        <ScoreReport
          score={totalScore}
          questions={session.questions}
          evaluations={evaluations}
          footer={
            <p className="text-sm text-secondary">
              Below the pass mark of {DEBRIEF_PAR_SCORE}. Next attempt opens{' '}
              <span className="font-medium text-primary">
                <DebriefTime iso={panel.availableAt} />
              </span>
              , with fresh questions.
            </p>
          }
        />
      ) : null;
    case 'passed':
      return (
        <DebriefAttemptHistory
          attempts={panel.attempts.map((attempt) => ({
            id: attempt.id,
            when: <DebriefTime iso={attempt.completedAt} />,
            score: attempt.totalScore,
            passed: attempt.passed,
            questions: attempt.questions,
            evaluations: attempt.evaluations,
          }))}
        />
      );
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
};
