import type { OutstandingItem } from '#/lib/course-progress-agg';
import type { DebriefStatusResponse } from '#/routes/api/lesson/debrief-status';
import { debriefSessionForLesson } from './parts/debrief-session-owner';

export type DebriefPanel =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not-done'; outstanding: readonly OutstandingItem[] }
  | { kind: 'waiting'; availableAt: string }
  /** Renders DebriefQuizContainer. */
  | { kind: 'take'; retake: boolean }
  /** The attempt just submitted, below par: its score report + reopen time (call 2). */
  | { kind: 'just-failed'; availableAt: string }
  /** ONLY the reopen time — no report, no history. */
  | { kind: 'retake-waiting'; availableAt: string }
  | {
      kind: 'passed';
      attempts: NonNullable<DebriefStatusResponse['attempts']>;
    };

export type ComputeDebriefPanelArgs = {
  status: {
    isPending: boolean;
    isError: boolean;
    data: DebriefStatusResponse | undefined;
  };
  /** `justSubmittedDebriefAtom`. */
  justSubmittedLessonSlug: string | null;
  lessonSlug: string;
  /** An in-memory debrief session for this lesson exists and is not complete. */
  sessionInProgress: boolean;
};

/**
 * What the Debrief tab shows, from the server's state for this pilot.
 *
 * Pure because `DebriefPanelContainer` cannot be rendered under Vitest (the
 * hook dispatcher is null for this repo's hook-calling components), and this
 * is where the cases live.
 */
export function computeDebriefPanel({
  status,
  justSubmittedLessonSlug,
  lessonSlug,
  sessionInProgress,
}: ComputeDebriefPanelArgs): DebriefPanel {
  const state = status.data?.state;

  // A half-answered debrief is never taken away: a refocus refetch that
  // lands after the 24h boundary (or a pass in another tab) must not swap the
  // question out from under the pilot. The save is the server's to refuse.
  if (sessionInProgress) {
    return {
      kind: 'take',
      retake: state?.kind === 'open' ? state.retake : false,
    };
  }

  // Data first: a failed background refetch keeps the last known state
  // rather than replacing a working panel with an error.
  if (!status.data) {
    return status.isPending ? { kind: 'loading' } : { kind: 'error' };
  }

  const { data } = status;
  switch (data.state.kind) {
    case 'not-done':
      return { kind: 'not-done', outstanding: data.lessonOutstanding };
    case 'waiting':
      return { kind: 'waiting', availableAt: data.state.availableAt };
    case 'open':
      return { kind: 'take', retake: data.state.retake };
    case 'retake-waiting':
      return justSubmittedLessonSlug === lessonSlug
        ? { kind: 'just-failed', availableAt: data.state.availableAt }
        : { kind: 'retake-waiting', availableAt: data.state.availableAt };
    case 'passed':
      return { kind: 'passed', attempts: data.attempts ?? [] };
    default: {
      const _exhaustive: never = data.state;
      return _exhaustive;
    }
  }
}

export type DebriefSessionProgress = 'none' | 'in-progress' | 'complete';

/**
 * Where this lesson's in-memory debrief session stands. A session for another
 * lesson counts as none (see `debriefSessionForLesson`).
 */
export function debriefSessionProgress(
  session: { lessonSlug: string; questions: readonly unknown[] } | null,
  evaluatedCount: number,
  lessonSlug: string,
): DebriefSessionProgress {
  const own = debriefSessionForLesson(session, lessonSlug);
  if (own === null) return 'none';
  return evaluatedCount >= own.questions.length ? 'complete' : 'in-progress';
}

/**
 * Whether the completed session in memory is a submitted attempt the debrief
 * has since reopened past — the page stayed open through the 24h wait. Left
 * in place, its old score report would sit where the fresh debrief's Start
 * belongs, with no way on (Retake is gone, call 8).
 *
 * `isFetching` matters: between a save and its refetch the cached status
 * still says `open`, and that is the old status, not a reopening.
 */
export function isStaleDebriefSession({
  sessionProgress,
  justSubmittedLessonSlug,
  lessonSlug,
  status,
}: {
  sessionProgress: DebriefSessionProgress;
  justSubmittedLessonSlug: string | null;
  lessonSlug: string;
  status: { isFetching: boolean; data: DebriefStatusResponse | undefined };
}): boolean {
  return (
    sessionProgress === 'complete' &&
    justSubmittedLessonSlug === lessonSlug &&
    !status.isFetching &&
    status.data?.state.kind === 'open'
  );
}

/**
 * The panel to actually render, given what is in memory.
 *
 * - While a stale session is being cleared, mount nothing that could save it:
 *   DebriefQuizContainer auto-saves a complete session it has not saved, and
 *   a child's effect runs before its parent's reset — it would record the old
 *   attempt again against the reopened debrief and re-lock it for 24h.
 * - just-failed reports the session in memory; if that is gone (another
 *   lesson's debrief replaced it), only the reopen time is left to show.
 */
export function settleDebriefPanel(
  panel: DebriefPanel,
  {
    sessionProgress,
    stale,
  }: { sessionProgress: DebriefSessionProgress; stale: boolean },
): DebriefPanel {
  if (stale) return { kind: 'loading' };
  if (panel.kind === 'just-failed' && sessionProgress !== 'complete') {
    return { kind: 'retake-waiting', availableAt: panel.availableAt };
  }
  return panel;
}
