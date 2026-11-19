import { useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import {
  debriefNotOpenAtom,
  debriefOpenedAnnouncementAtom,
  debriefRetakeLaterAtom,
  justFinishedDebriefAtom,
  startDebriefAttemptAtom,
} from '#/atoms/debrief';
import { ClientGate } from '#/components/client-gate';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import { dataKeys } from '#/data-hooks/keys';
import {
  DebriefNotOpenError,
  useStartDebrief,
} from '#/data-hooks/use-debrief-attempt';
import { useDebriefStatus } from '#/data-hooks/use-debrief-status';
import { useLessonQuizResult } from '#/data-hooks/use-lesson-quiz-result';
import { DEBRIEF_DECLINE_COPY } from '#/lib/debrief-copy';
import { formatDebriefTime } from '#/lib/format-debrief-time';
import {
  attemptFormat,
  computeDebriefPanel,
  countdownTarget,
} from '../compute-debrief-panel';
import { DebriefAttemptHistory } from './debrief-attempt-history';
import { DebriefQuizContainer } from './debrief-quiz-container';
import { DebriefRetakePrompt } from './debrief-retake-prompt';
import { DebriefWait } from './debrief-wait';
import { ScoreReport } from './score-report';
import { useDebriefCountdown } from './use-debrief-countdown';

type DebriefPanelContainerProps = {
  courseSlug: string;
  lessonSlug: string;
  /**
   * Completed at an earlier level. Callers do not render a Debrief panel for
   * such a lesson (call 12); passed through so the quiz stays inert if one
   * ever does.
   */
  readOnly: boolean;
  /**
   * The level the panel's own headings take: 2 under the tab strip, 3 inside
   * the material-less lesson's "Debrief" section, which is itself an h2.
   */
  headingLevel: 2 | 3;
};

/** What screen readers hear when a countdown runs out and the debrief opens. */
export const DEBRIEF_OPENED_COPY = 'Your next debrief is open.';

/** An ISO instant in the pilot's timezone — client-only, see formatDebriefTime. */
const DebriefTime = ({ iso }: { iso: string }) => (
  <ClientGate>{() => formatDebriefTime(iso, new Date())}</ClientGate>
);

/**
 * The Debrief tab: reads this pilot's debrief state and renders the panel
 * `computeDebriefPanel` picks. Every branch lives in that pure module; this
 * wires hooks to it, runs the countdown, and tidies what a finished or
 * reopened attempt leaves behind.
 */
export const DebriefPanelContainer = ({
  courseSlug,
  lessonSlug,
  readOnly,
  headingLevel,
}: DebriefPanelContainerProps) => {
  const idBase = useId();
  const queryClient = useQueryClient();
  const status = useDebriefStatus({ courseSlug, lessonSlug, enabled: true });
  // Reads the attempt cache only — DebriefQuizContainer does the fetching.
  const attemptCache = useStartDebrief({
    courseSlug,
    lessonSlug,
    enabled: false,
  });
  const finished = useAtomValue(justFinishedDebriefAtom);
  const [opened, setOpened] = useAtom(debriefOpenedAnnouncementAtom);
  const setNotOpen = useSetAtom(debriefNotOpenAtom);
  const startAttempt = useSetAtom(startDebriefAttemptAtom);
  const retakeLater = useSetAtom(debriefRetakeLaterAtom);
  // Loading reads as taken, so "Quiz not taken yet" never flashes.
  const quizTaken = useLessonQuizResult(lessonSlug).data !== null;

  const panel = computeDebriefPanel({
    status,
    finished,
    lessonSlug,
    attemptInProgress:
      attemptCache.data !== undefined &&
      !(attemptCache.error instanceof DebriefNotOpenError),
  });

  // Outside `take` this lesson has no attempt on screen: drop the cached one,
  // so a later take starts from what the server holds, never from an old
  // attempt (finished, or refused by a 409). Runs after commit, when the quiz
  // container — the cache's only fetching observer — has unmounted.
  useEffect(() => {
    if (panel.kind === 'take' || panel.kind === 'loading') return;
    queryClient.removeQueries({
      queryKey: dataKeys.debriefAttempt(lessonSlug),
      exact: true,
    });
    setNotOpen((current) =>
      current?.lessonSlug === lessonSlug ? null : current,
    );
  }, [panel.kind, queryClient, lessonSlug, setNotOpen]);

  // Screen readers hear when the 12 h wait ends and the debrief opens — here,
  // in a region the panel always renders.
  const previousKind = useRef(panel.kind);
  useEffect(() => {
    const was = previousKind.current;
    previousKind.current = panel.kind;
    if (panel.kind === 'take' && was === 'waiting') {
      setOpened(DEBRIEF_OPENED_COPY);
    } else if (panel.kind !== 'take') {
      setOpened('');
    }
  }, [panel.kind, setOpened]);

  // The report's heading takes focus when the report appears (the button
  // that led here is gone) and again after Later closes the retake prompt.
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const reportFocusKey =
    panel.kind === 'finished'
      ? `${panel.report.finishedAt}:${panel.report.note}`
      : null;
  useEffect(() => {
    if (reportFocusKey !== null) reportHeading.current?.focus();
  }, [reportFocusKey]);

  const { refetch } = status;
  useDebriefCountdown(countdownTarget(panel), refetch);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics */}
      <p role="status" className="sr-only">
        {opened}
      </p>
      {renderPanel()}
    </>
  );

  function renderPanel() {
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
        // A refusal is an answer, not a failure: no retry, and nothing about
        // the connection.
        return panel.refused ? (
          <p className="py-2 text-sm text-secondary">{panel.message}</p>
        ) : (
          <LessonError
            message={panel.message}
            onRetry={() => void refetch()}
            subject="your debrief"
          />
        );
      case 'not-done':
        return (
          <DebriefWait
            idBase={idBase}
            headingLevel={headingLevel}
            kind="not-done"
            outstanding={panel.outstanding}
            courseSlug={courseSlug}
          />
        );
      case 'waiting':
        return (
          <DebriefWait
            idBase={idBase}
            headingLevel={headingLevel}
            kind="waiting"
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
            resume={panel.resume}
            headingLevel={headingLevel}
            refetchStatus={refetch}
          />
        );
      case 'finished': {
        const { note } = panel.report;
        return (
          <ScoreReport
            result={panel.report.result}
            score={panel.report.score}
            quizTaken={quizTaken}
            revisitNotes={panel.report.revisitNotes}
            headingLevel={headingLevel}
            idBase={idBase}
            headingRef={reportHeading}
            footer={
              note === 'declined' ? (
                <p className="text-sm text-primary">{DEBRIEF_DECLINE_COPY}</p>
              ) : note === 'retake' && !readOnly ? (
                <DebriefRetakePrompt
                  onRetakeNow={() => startAttempt(lessonSlug)}
                  onLater={() => retakeLater()}
                />
              ) : undefined
            }
          />
        );
      }
      case 'passed':
        return (
          <DebriefAttemptHistory
            attempts={panel.attempts.map((attempt) => ({
              id: attempt.id,
              when: <DebriefTime iso={attempt.completedAt} />,
              score: attempt.totalScore,
              passed: attempt.passed,
              format: attemptFormat(attempt.evaluations),
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
  }
};
