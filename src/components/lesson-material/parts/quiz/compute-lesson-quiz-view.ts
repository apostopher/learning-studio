import {
  buildQuizAnswers,
  emptyQuizProgress,
  type QuizAnswerMap,
  type QuizProgress,
  restoreQuizProgress,
} from '#/lib/lesson-quiz';
import type { CourseLessonQuiz, CourseLessonQuizAnswers } from '#/types';

/**
 * What the quiz tab renders, decided as a pure function.
 *
 * Extracted for the same reason as `compute-material-panel-state.ts`: the
 * container calls hooks and so cannot be rendered under Vitest, and the
 * branching here is where the expensive mistakes live — showing a stale saved
 * result over an in-progress retake, or letting a student answer before the
 * saved result has landed.
 */
export type LessonQuizView =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | {
      kind: 'quiz';
      index: number;
      answers: QuizAnswerMap;
      revealedQuestionId: string | null;
      /** Non-null exactly when the result slide is showing. */
      resultAnswers: CourseLessonQuizAnswers | null;
      /**
       * Where `resultAnswers` came from. `'saved'` is a completed attempt read
       * back from the server; `'local'` is the attempt happening right now and
       * is the only one that may still need submitting.
       */
      source: 'saved' | 'local';
    };

export type LessonQuizViewInput = {
  /** Questions that survived validation — see `partitionQuiz`. */
  askable: CourseLessonQuiz;
  /**
   * Whether the saved-result query has actually fetched. Not `!isLoading`: a
   * student who answers while it is still in flight has their tap discarded
   * when last week's attempt lands, or unknowingly starts a second attempt.
   */
  isFetched: boolean;
  /** The latest recorded attempt, if any. */
  saved: CourseLessonQuizAnswers | null;
  /** Set by the Retake button; not persisted across reloads. */
  isRetaking: boolean;
  storedProgress: QuizProgress | null;
};

/** Whether the student has touched this quiz in the current local attempt. */
export function hasStartedQuiz(progress: QuizProgress): boolean {
  return progress.index > 0 || Object.keys(progress.answers).length > 0;
}

export function computeLessonQuizView({
  askable,
  isFetched,
  saved,
  isRetaking,
  storedProgress,
}: LessonQuizViewInput): LessonQuizView {
  // Checked before the fetch gate on purpose: a lesson with no usable quiz has
  // nothing to say regardless of what the server holds, and showing a skeleton
  // first would just be a flicker on the way to the same empty state.
  if (askable.length === 0) return { kind: 'empty' };

  if (!isFetched) return { kind: 'loading' };

  const progress =
    restoreQuizProgress(storedProgress, askable) ?? emptyQuizProgress;

  // Local progress wins over a saved attempt. Without this, a student who
  // retakes, answers two questions and reloads (which clears `isRetaking`,
  // since it isn't persisted) is thrown back to their old result with the
  // retake silently discarded.
  if (saved && !isRetaking && !hasStartedQuiz(progress)) {
    return {
      kind: 'quiz',
      index: askable.length,
      answers: {},
      revealedQuestionId: null,
      resultAnswers: saved,
      source: 'saved',
    };
  }

  const isComplete = progress.index >= askable.length;

  return {
    kind: 'quiz',
    index: progress.index,
    answers: progress.answers,
    revealedQuestionId: progress.revealedQuestionId,
    resultAnswers: isComplete
      ? buildQuizAnswers(askable, progress.answers)
      : null,
    source: 'local',
  };
}
