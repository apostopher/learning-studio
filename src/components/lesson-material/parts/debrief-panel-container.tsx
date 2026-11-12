import { useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import {
  debriefCountdownAnnouncementAtom,
  debriefCountdownAtom,
  debriefNotOpenAtom,
  debriefOpenedAnnouncementAtom,
  justFinishedDebriefAtom,
} from '#/atoms/debrief';
import { ClientGate } from '#/components/client-gate';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import { dataKeys } from '#/data-hooks/keys';
import {
  DebriefNotOpenError,
  useStartDebrief,
} from '#/data-hooks/use-debrief-attempt';
import { useDebriefStatus } from '#/data-hooks/use-debrief-status';
import { formatCountdown } from '#/lib/format-countdown';
import { formatDebriefTime } from '#/lib/format-debrief-time';
import {
  attemptFormat,
  computeDebriefPanel,
  countdownTarget,
  isStaleFinishedDebrief,
} from '../compute-debrief-panel';
import { DebriefAttemptHistory } from './debrief-attempt-history';
import { DebriefCountdown } from './debrief-countdown';
import { DebriefQuizContainer } from './debrief-quiz-container';
import { DebriefWait, RETAKE_WAIT_REASON } from './debrief-wait';
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
  const [finished, setFinished] = useAtom(justFinishedDebriefAtom);
  const countdown = useAtomValue(debriefCountdownAtom);
  const announcement = useAtomValue(debriefCountdownAnnouncementAtom);
  const [opened, setOpened] = useAtom(debriefOpenedAnnouncementAtom);
  const setNotOpen = useSetAtom(debriefNotOpenAtom);

  const panel = computeDebriefPanel({
    status,
    finished,
    lessonSlug,
    attemptInProgress:
      attemptCache.data !== undefined &&
      !(attemptCache.error instanceof DebriefNotOpenError),
  });

  // The debrief reopened while this page held the last report: drop it so
  // the tab offers the fresh attempt instead.
  const stale = isStaleFinishedDebrief(finished, lessonSlug, status);
  useEffect(() => {
    if (stale) setFinished(null);
  }, [stale, setFinished]);

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

  // Screen readers hear the countdown once when it starts (its own status)
  // and once when it opens — here, in a region that outlives the countdown.
  const previousKind = useRef(panel.kind);
  useEffect(() => {
    const was = previousKind.current;
    previousKind.current = panel.kind;
    if (
      panel.kind === 'take' &&
      (was === 'retake-waiting' || was === 'finished' || was === 'waiting')
    ) {
      setOpened(DEBRIEF_OPENED_COPY);
    } else if (panel.kind !== 'take') {
      setOpened('');
    }
  }, [panel.kind, setOpened]);

  const { availableAt, announceKey } = countdownTarget(panel);
  const { refetch } = status;
  useDebriefCountdown(availableAt, refetch, announceKey);
  const countdownText = (iso: string) =>
    formatCountdown(
      countdown?.availableAt === iso
        ? countdown.msLeft
        : // First render, before the tick's effect writes the atom. The
          // panel is client-only past `loading` (the status is never
          // fetched on the server), so reading the clock here is safe.
          Date.parse(iso) - Date.now(),
    );

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics */}
      <p role="status" className="sr-only">
        {opened}
      </p>
      {renderPanel()}
    </>
  );

  /** Under a report: the countdown to the next attempt and why it waits. */
  function retakeFooter(at: string) {
    return (
      <div className="flex flex-col gap-2 border-t border-gray-6 pt-4">
        <DebriefCountdown
          countdown={countdownText(at)}
          clockTime={<DebriefTime iso={at} />}
          announcement={announcement}
          headingLevel={headingLevel}
        />
        <p className="text-sm text-secondary">{RETAKE_WAIT_REASON}</p>
      </div>
    );
  }

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
      case 'retake-waiting':
        // The report the server keeps, so a reload or another device during
        // the wait still shows mastery and what to revisit; the countdown
        // alone only when there is no chunk mastery (legacy attempts only).
        return panel.report === null ? (
          <DebriefWait
            idBase={idBase}
            headingLevel={headingLevel}
            kind="retake-waiting"
            countdown={countdownText(panel.availableAt)}
            time={<DebriefTime iso={panel.availableAt} />}
            announcement={announcement}
          />
        ) : (
          <ScoreReport
            mastery={panel.report.mastery}
            revisitNotes={panel.report.revisitNotes}
            headingLevel={headingLevel}
            idBase={idBase}
            footer={retakeFooter(panel.availableAt)}
          />
        );
      case 'take':
        return (
          <DebriefQuizContainer
            courseSlug={courseSlug}
            lessonSlug={lessonSlug}
            readOnly={readOnly}
            retake={panel.retake}
            clearedSome={panel.clearedSome}
            resume={panel.resume}
            headingLevel={headingLevel}
            refetchStatus={refetch}
          />
        );
      case 'finished':
        return (
          <ScoreReport
            mastery={panel.report.mastery}
            revisitNotes={panel.report.revisitNotes}
            headingLevel={headingLevel}
            idBase={idBase}
            footer={
              panel.availableAt === null
                ? null
                : retakeFooter(panel.availableAt)
            }
          />
        );
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
