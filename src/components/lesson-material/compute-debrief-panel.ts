import type {
  DebriefAnswerResult,
  DebriefAttemptView,
} from '#/data-hooks/use-debrief-attempt';
import {
  type DebriefStatus,
  DebriefStatusError,
} from '#/data-hooks/use-debrief-status';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { masteryPercent } from '#/lib/debrief-mastery';
import { DEBRIEF_RETAKE_DELAY_MS } from '#/lib/debrief-schedule';

/**
 * An attempt that finished while the pilot was on its lesson: what its score
 * report shows. Kept in `justFinishedDebriefAtom` because the status refetch
 * that follows the last answer moves the debrief on (retake-waiting, or
 * passed) and the report must survive that.
 */
export type FinishedDebrief = {
  lessonSlug: string;
  /** `Date.now()` when the last answer was graded. */
  finishedAt: number;
  mastery: { cleared: number; total: number; percent: number; passed: boolean };
  revisitNotes: string[];
};

export type DebriefPanel =
  | { kind: 'loading' }
  /**
   * `refused`: the server said no (403/404) — retrying cannot help and the
   * connection is not to blame. Otherwise a network or server failure.
   */
  | { kind: 'error'; refused: boolean; message: string }
  | { kind: 'not-done'; outstanding: readonly OutstandingItem[] }
  | { kind: 'waiting'; availableAt: string }
  /** Renders DebriefQuizContainer. `resume`: an attempt is already open. */
  | { kind: 'take'; retake: boolean; resume: boolean }
  /**
   * The attempt just finished on this lesson: its report, and the countdown
   * to the next attempt (null once passed).
   */
  | { kind: 'finished'; report: FinishedDebrief; availableAt: string | null }
  /** A later visit during the 6 h wait: the countdown only. */
  | { kind: 'retake-waiting'; availableAt: string }
  | { kind: 'passed'; attempts: NonNullable<DebriefStatus['attempts']> };

type StatusView = {
  isPending: boolean;
  isError: boolean;
  /** The query's error — a `DebriefStatusError` carries the HTTP status. */
  error?: unknown;
  data: DebriefStatus | undefined;
  /** When `data` was fetched (TanStack's `dataUpdatedAt`, ms). */
  dataUpdatedAt: number;
};

export type ComputeDebriefPanelArgs = {
  status: StatusView;
  /** `justFinishedDebriefAtom`. */
  finished: FinishedDebrief | null;
  lessonSlug: string;
  /** This lesson's attempt is loaded on the page (the attempt cache holds it). */
  attemptInProgress: boolean;
};

/** The route refused this pilot this lesson's debrief (403 or 404). */
export const DEBRIEF_REFUSED_COPY =
  "This debrief isn't available for this lesson.";

/** The status could not be fetched — network or server. */
export const DEBRIEF_FAILED_COPY =
  "Your debrief's schedule didn't load. Check your connection and try again.";

/** 403 (gate, level, out-of-tier) and 404 (no debrief) are answers, not failures. */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof DebriefStatusError &&
    (error.status === 403 || error.status === 404)
  );
}

/**
 * Whether the just-finished report has been overtaken: a status fetched
 * after the finish says the debrief is open again (the 6 h ran out while the
 * page stayed open). Fetched AFTER matters: until the refetch that follows
 * the last answer lands, the cached status still says open, and that is the
 * attempt just finished, not a reopening.
 */
export function isStaleFinishedDebrief(
  finished: FinishedDebrief | null,
  lessonSlug: string,
  status: Pick<StatusView, 'data' | 'dataUpdatedAt'>,
): boolean {
  return (
    finished !== null &&
    finished.lessonSlug === lessonSlug &&
    status.data?.state.kind === 'open' &&
    status.dataUpdatedAt > finished.finishedAt
  );
}

/**
 * What the Debrief tab shows, from the server's state for this pilot.
 *
 * Pure because `DebriefPanelContainer` cannot be rendered under Vitest (the
 * hook dispatcher is null for this repo's hook-calling components), and this
 * is where the cases live.
 */
export function computeDebriefPanel({
  status,
  finished,
  lessonSlug,
  attemptInProgress,
}: ComputeDebriefPanelArgs): DebriefPanel {
  const state = status.data?.state;

  const own = finished?.lessonSlug === lessonSlug ? finished : null;
  if (own && !isStaleFinishedDebrief(own, lessonSlug, status)) {
    return {
      kind: 'finished',
      report: own,
      availableAt: own.mastery.passed
        ? null
        : state?.kind === 'retake-waiting'
          ? state.availableAt
          : new Date(own.finishedAt + DEBRIEF_RETAKE_DELAY_MS).toISOString(),
    };
  }

  // A half-answered attempt is never taken away: a refocus refetch (or a
  // pass in another tab) must not swap the question out from under the
  // pilot. The answer is the server's to refuse.
  if (attemptInProgress) {
    return {
      kind: 'take',
      retake: state?.kind === 'open' ? state.retake : false,
      resume: true,
    };
  }

  // Data first: a failed background refetch keeps the last known state
  // rather than replacing a working panel with an error.
  if (!status.data) {
    if (status.isPending) return { kind: 'loading' };
    const refused = isRefusal(status.error);
    return {
      kind: 'error',
      refused,
      message: refused ? DEBRIEF_REFUSED_COPY : DEBRIEF_FAILED_COPY,
    };
  }

  const { data } = status;
  switch (data.state.kind) {
    case 'not-done':
      return { kind: 'not-done', outstanding: data.lessonOutstanding };
    case 'waiting':
      return { kind: 'waiting', availableAt: data.state.availableAt };
    case 'open':
      return {
        kind: 'take',
        retake: data.state.retake,
        resume: data.state.resume,
      };
    case 'retake-waiting':
      return { kind: 'retake-waiting', availableAt: data.state.availableAt };
    case 'passed':
      return { kind: 'passed', attempts: data.attempts ?? [] };
    default: {
      const _exhaustive: never = data.state;
      return _exhaustive;
    }
  }
}

/**
 * The question the pilot is on: the first one not yet answered, with the
 * draft saved for it ('' when the draft is for another question). Null once
 * every question is answered.
 */
export function currentDebriefQuestion(attempt: DebriefAttemptView): {
  question: { id: string; question: string };
  index: number;
  total: number;
  draft: string;
} | null {
  const answered = new Set(attempt.answered.map((a) => a.questionId));
  const index = attempt.questions.findIndex((q) => !answered.has(q.id));
  const question = attempt.questions[index];
  if (index < 0 || question === undefined) return null;
  return {
    question,
    index,
    total: attempt.questions.length,
    draft: attempt.draft?.questionId === question.id ? attempt.draft.text : '',
  };
}

/**
 * "Worth revisiting": the grader's note on each answer, in question order,
 * each once, empty ones dropped. An answer that cleared its chunk carries no
 * note (the grader writes none), so only holes are listed.
 */
export function revisitNotesOf(
  questions: readonly { id: string }[],
  evaluations: readonly { questionId: string; revisitNote?: string }[],
): string[] {
  const notes = new Set<string>();
  for (const question of questions) {
    for (const e of evaluations) {
      if (e.questionId !== question.id) continue;
      const note = e.revisitNote?.trim();
      if (note) notes.add(note);
    }
  }
  return [...notes];
}

/**
 * The report of an attempt the answer `result` just finished, from the
 * attempt as it stood before that answer plus the answer itself. Null while
 * the attempt goes on. A pass (every chunk cleared) is 100 with nothing to
 * revisit.
 */
export function finishedDebriefReport({
  lessonSlug,
  attempt,
  questionId,
  result,
  now,
}: {
  lessonSlug: string;
  attempt: DebriefAttemptView;
  questionId: string;
  result: DebriefAnswerResult;
  now: number;
}): FinishedDebrief | null {
  if (result.finished === null) return null;
  const passed = result.finished === 'all-cleared';
  const { cleared, total } = result.mastery;
  return {
    lessonSlug,
    finishedAt: now,
    mastery: {
      cleared,
      total,
      percent: masteryPercent({ cleared, total, passed }),
      passed,
    },
    revisitNotes: passed
      ? []
      : revisitNotesOf(attempt.questions, [
          ...attempt.answered.filter((a) => a.questionId !== questionId),
          { questionId, revisitNote: result.evaluation.revisitNote },
        ]),
  };
}
