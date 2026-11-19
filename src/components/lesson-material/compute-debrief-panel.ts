import {
  type DebriefAnswerResult,
  type DebriefAttemptView,
  DebriefNoSourceError,
  DebriefNotOpenError,
  DebriefPreparingError,
  DebriefRequestError,
} from '#/data-hooks/use-debrief-attempt';
import {
  type DebriefStatus,
  DebriefStatusError,
} from '#/data-hooks/use-debrief-status';
import { revisitNotesOf } from '#/lib/client-debrief-attempt';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { setAverage } from '#/lib/debrief-sets';

/**
 * An attempt that finished while the pilot was on its lesson: what its score
 * report shows. Kept in `justFinishedDebriefAtom` only to bridge the moment
 * between the last answer and the status refetch landing: once it lands, an
 * open-for-retake status carries the same report from the server, and a pass
 * shows the pass report until the pilot leaves the lesson.
 */
export type FinishedDebrief = {
  lessonSlug: string;
  /** `Date.now()` when the last answer was graded. */
  finishedAt: number;
  /** What the report shows: the attempt's sets and whether one passed. */
  result: DebriefResult;
  revisitNotes: string[];
};

/**
 * An attempt's outcome as the report shows it. `setAverages` has one entry
 * per set completed, in order; empty on an attempt from before sets, which
 * shows `score` alone.
 */
export type DebriefResult = {
  passed: boolean;
  score: number;
  setAverages: number[];
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
  /**
   * Renders DebriefQuizContainer. `resume`: an attempt is already open.
   */
  | { kind: 'take'; retake: boolean; resume: boolean }
  /**
   * The attempt just finished on this lesson: its report. There is no retake
   * wait, so `availableAt` is always null (no countdown).
   */
  | { kind: 'finished'; report: FinishedDebrief; availableAt: null }
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
  // The report stays until the pilot leaves the lesson (the atom is cleared
  // then): a failed attempt leaves the status `open` for a retake at once, so
  // the status cannot be what dismisses it.
  if (own) {
    return {
      kind: 'finished',
      report: own,
      availableAt: null,
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
 * draft saved for it ('' when the draft is for another question), its set,
 * and its place within that set. Null once every question shown is answered.
 */
export function currentDebriefQuestion(attempt: DebriefAttemptView): {
  question: { id: string; question: string };
  set: number;
  index: number;
  total: number;
  draft: string;
} | null {
  const answered = new Set(attempt.answered.map((a) => a.questionId));
  const question = attempt.questions.find((q) => !answered.has(q.id));
  if (question === undefined) return null;
  const inSet = attempt.questions.filter((q) => q.set === question.set);
  return {
    question: { id: question.id, question: question.question },
    set: question.set,
    index: inSet.findIndex((q) => q.id === question.id),
    total: inSet.length,
    draft: attempt.draft?.questionId === question.id ? attempt.draft.text : '',
  };
}

/** "Set 1 · Question 2 of 4": where a question sits, as the pilot reads it. */
export function questionPosition(q: {
  set: number;
  index: number;
  total: number;
}): string {
  return `Set ${q.set} · Question ${q.index + 1} of ${q.total}`;
}

/** What the feedback's one button says, from what the answer did. */
export function feedbackNextLabel(
  result: Pick<DebriefAnswerResult, 'finished' | 'setResult'>,
): string {
  if (result.finished !== null) return 'See your result';
  if (result.setResult && !result.setResult.passed) {
    return `Start set ${result.setResult.set + 1}`;
  }
  return 'Next question';
}

/**
 * The report of an attempt the answer `result` just finished, from the
 * attempt as it stood before that answer plus the answer itself. Null while
 * the attempt goes on. A pass has nothing to revisit.
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
  const passed = result.finished === 'set-passed';
  const answered = [
    ...attempt.answered.filter((a) => a.questionId !== questionId),
    { questionId, score: result.evaluation.score },
  ];
  return {
    lessonSlug,
    finishedAt: now,
    result: {
      passed,
      score: result.setResult?.average ?? result.evaluation.score,
      setAverages: setAveragesOf(attempt.questions, answered),
    },
    revisitNotes: passed
      ? []
      : revisitNotesOf(attempt.questions, [
          ...attempt.answered.filter((a) => a.questionId !== questionId),
          { questionId, revisitNote: result.evaluation.revisitNote },
        ]),
  };
}

/** Each fully answered set's average, in set order. */
export function setAveragesOf(
  questions: readonly { id: string; set: number }[],
  answered: readonly { questionId: string; score: number }[],
): number[] {
  const scoreOf = new Map(answered.map((a) => [a.questionId, a.score]));
  const bySet = new Map<number, string[]>();
  for (const q of questions) {
    bySet.set(q.set, [...(bySet.get(q.set) ?? []), q.id]);
  }
  return [...bySet.keys()]
    .sort((a, b) => a - b)
    .flatMap((set) => {
      const ids = bySet.get(set) ?? [];
      return ids.every((id) => scoreOf.has(id))
        ? [setAverage(ids.map((id) => scoreOf.get(id) ?? 0))]
        : [];
    });
}

/**
 * What the status is re-checked at: only the 12 h first-debrief wait ends at
 * a known time. There is no retake wait.
 */
export function countdownTarget(panel: DebriefPanel): string | null {
  return panel.kind === 'waiting' ? panel.availableAt : null;
}

/**
 * A passed-history attempt's format. A set attempt's answers carry Viper's
 * feedback; a chunk attempt's carry a revisit note (empty when the chunk was
 * shown); a legacy one's carry neither.
 */
export function attemptFormat(
  evaluations: readonly {
    questionId: string;
    score: number;
    revisitNote?: string;
    feedback?: string;
  }[],
): 'sets' | 'chunk' | 'legacy' {
  if (evaluations.some((e) => e.feedback !== undefined)) return 'sets';
  return evaluations.some((e) => e.revisitNote !== undefined)
    ? 'chunk'
    : 'legacy';
}

/** The answer did not reach the grader. The text stays in the box. */
export const DEBRIEF_ANSWER_FAILED_COPY =
  "Your answer didn't send. Check your connection and submit it again.";

/**
 * The server refused the answer (4xx other than 403/404): this page's copy
 * of the attempt is behind (answered in another tab). The attempt is reloaded.
 */
export const DEBRIEF_ANSWER_REFUSED_COPY =
  "That answer wasn't accepted, so your debrief has been reloaded from where it stands. Check the question and submit again.";

/**
 * 403/404 on an answer: the attempt has closed (finished in another tab) or
 * this debrief is no longer the pilot's to take here. The reload that follows
 * shows which.
 */
export const DEBRIEF_ANSWER_FORBIDDEN_COPY =
  "That answer wasn't accepted: this attempt has closed, or this debrief is no longer available to you. It has been reloaded to show where it stands.";

/** What the alert under the question says about a failed answer. */
export function answerErrorCopy(error: unknown): string {
  if (error instanceof DebriefRequestError) {
    if (error.status === 403 || error.status === 404) {
      return DEBRIEF_ANSWER_FORBIDDEN_COPY;
    }
    if (error.status >= 400 && error.status < 500) {
      return DEBRIEF_ANSWER_REFUSED_COPY;
    }
  }
  return DEBRIEF_ANSWER_FAILED_COPY;
}

/** 422 from the start route. Says why there is nothing to start. */
export const DEBRIEF_NO_SOURCE_COPY =
  'There is nothing to debrief on this lesson yet: it has no key points or video transcript to ask about.';

export const DEBRIEF_START_FAILED_COPY =
  "Your debrief didn't load. Check your connection and try again.";

/** The 503 retries ran out: still being prepared, not broken. */
export const DEBRIEF_PREPARING_STALLED_COPY =
  'Your debrief is taking longer than usual to prepare. Try again in a moment.';

export type DebriefStartError =
  | 'no-source'
  | 'preparing'
  | 'preparing-stalled'
  | 'refused'
  | 'failed';

/**
 * What the start query's failure means. `failureReason` is set while a
 * retry is pending (`error` only once retries are exhausted), so a 503
 * being retried reads as `preparing` from the first failure. A 409 is the
 * not-open path (`debriefNotOpenAtom`), not an error here.
 */
export function startErrorOf(s: {
  error: unknown;
  failureReason: unknown;
}): DebriefStartError | null {
  if (s.error === null || s.error === undefined) {
    return s.failureReason instanceof DebriefPreparingError
      ? 'preparing'
      : null;
  }
  const { error } = s;
  if (error instanceof DebriefNotOpenError) return null;
  if (error instanceof DebriefNoSourceError) return 'no-source';
  if (error instanceof DebriefPreparingError) return 'preparing-stalled';
  if (
    error instanceof DebriefRequestError &&
    (error.status === 403 || error.status === 404)
  ) {
    return 'refused';
  }
  return 'failed';
}

export type DebriefQuizView =
  | 'read-only'
  | 'not-open-countdown'
  | 'not-open-checking'
  | 'intro'
  | 'no-source'
  | 'refused'
  | 'preparing'
  | 'preparing-stalled'
  | 'start-failed'
  | 'starting'
  | 'resuming'
  | 'scoring'
  | 'feedback'
  | 'question';

/**
 * Which branch `DebriefQuizContainer` renders. Order matters: a 409 from
 * start (`notOpen`) wins over the intro, or a refused Start would offer
 * Start again with no reason and no time; and a 403/404 (`refused`) wins
 * over a loaded attempt, or a pilot who lost access mid-attempt would keep
 * answering a question the server will refuse.
 */
export function debriefQuizView(v: {
  readOnly: boolean;
  /** The start query may run: Start pressed, or resuming. */
  enabled: boolean;
  resume: boolean;
  /** This lesson's last start answer was 409, with the time it gave. */
  notOpen: { availableAt: string | null } | null;
  hasAttempt: boolean;
  startError: DebriefStartError | null;
  /** An unanswered question is left. */
  hasCurrent: boolean;
  /** Viper's feedback on the last answer is waiting for Next. */
  hasFeedback: boolean;
}): DebriefQuizView {
  if (v.readOnly) return 'read-only';
  if (v.notOpen) {
    return v.notOpen.availableAt === null
      ? 'not-open-checking'
      : 'not-open-countdown';
  }
  if (v.startError === 'refused') return 'refused';
  if (!v.hasAttempt && !v.enabled) return 'intro';
  if (v.startError === 'no-source') return 'no-source';
  if (!v.hasAttempt) {
    if (v.startError === 'preparing') return 'preparing';
    if (v.startError === 'preparing-stalled') return 'preparing-stalled';
    if (v.startError === 'failed') return 'start-failed';
    return v.resume ? 'resuming' : 'starting';
  }
  if (v.hasFeedback) return 'feedback';
  return v.hasCurrent ? 'question' : 'scoring';
}
