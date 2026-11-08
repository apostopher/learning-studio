import type {
  CourseLessonQuiz,
  CourseLessonQuizAnswers,
  CourseLessonQuizQuestion,
} from '#/types';

/**
 * Pure rules for the lesson's authored quiz. Shared by the client (which
 * filters before rendering) and the material route (which reports what it had
 * to drop), so "what counts as a usable question" is defined exactly once.
 *
 * No hooks, no DOM, no fetch — every function here is testable in isolation,
 * for the same reason `compute-material-panel-state.ts` is: the components
 * that consume them cannot be rendered under Vitest.
 */

/** Option labels, matching the previous implementation's A/B/C badges. */
const LETTER_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const optionLetter = (index: number): string =>
  LETTER_LABELS[index] ?? '?';

/**
 * Whether a question can be asked at all.
 *
 * The admin editor (`quiz-field.tsx`) permits every failure below: options can
 * be deleted down to none, and `correctOptionId` is defaulted to `'a'` on
 * creation and never revalidated when an option is removed. Asking such a
 * question is worse than dropping it — the student answers, gets marked wrong,
 * and no option is ever shown as correct.
 */
export function isAskableQuestion(question: CourseLessonQuizQuestion): boolean {
  if (question.options.length < 2) return false;
  const ids = question.options.map((option) => option.id);
  if (new Set(ids).size !== ids.length) return false;
  return ids.includes(question.correctOptionId);
}

export type QuizPartition = {
  /** Questions safe to ask, in authored order, with duplicate ids removed. */
  askable: CourseLessonQuiz;
  /** Ids of everything dropped — reported, never silently swallowed. */
  droppedIds: string[];
};

/**
 * Split a stored quiz into what we can ask and what we cannot.
 *
 * Duplicate *question* ids are dropped as well (keeping the first): answers are
 * keyed by question id, so two questions sharing one id would have the second
 * inherit the first's answer and reveal state.
 */
export function partitionQuiz(quiz: CourseLessonQuiz | null): QuizPartition {
  const askable: CourseLessonQuizQuestion[] = [];
  const droppedIds: string[] = [];
  const seen = new Set<string>();

  for (const question of quiz ?? []) {
    if (seen.has(question.id) || !isAskableQuestion(question)) {
      droppedIds.push(question.id);
      continue;
    }
    seen.add(question.id);
    askable.push(question);
  }

  return { askable, droppedIds };
}

/** Answers so far, as question id → chosen option id. */
export type QuizAnswerMap = Record<string, string>;

export type QuizProgress = {
  /** Index of the question on screen. Equals `askable.length` on the result slide. */
  index: number;
  answers: QuizAnswerMap;
  /**
   * The question whose answer is currently revealed, if any. Non-null only
   * while a wrong answer is being held for the student to read.
   */
  revealedQuestionId: string | null;
  /**
   * This attempt's shuffle (see `quizForAttempt`): drawn fresh for every
   * attempt so a retake meets the questions and options in a new order.
   * Absent or null keeps authored order — progress saved before shuffling
   * existed must not be scrambled out from under its answered prefix.
   */
  seed?: number | null;
};

export const emptyQuizProgress: QuizProgress = {
  index: 0,
  answers: {},
  revealedQuestionId: null,
};

/** A fresh shuffle seed for a new attempt: an unsigned 32-bit integer. */
export function newQuizSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * mulberry32 — a tiny seeded PRNG. Deterministic on purpose: the order must
 * survive a reload mid-attempt, so it is derived from the stored seed rather
 * than drawn afresh on every render.
 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher–Yates over a copy. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The quiz in this seed's order: the questions shuffled, and each question's
 * options shuffled. Only reorders — ids, and so `correctOptionId`, answers and
 * scoring, are untouched. The authored quiz is not mutated.
 */
export function shuffleQuiz(
  quiz: CourseLessonQuiz,
  seed: number,
): CourseLessonQuiz {
  const random = seededRandom(seed);
  return shuffled(quiz, random).map((question) => ({
    ...question,
    options: shuffled(question.options, random),
  }));
}

/**
 * The questions as this attempt shows them. Everything that walks the quiz by
 * position — the view, restore, the answer snapshot — must use this, not the
 * authored order, or the cursor would point at a different question than the
 * one on screen.
 */
export function quizForAttempt(
  askable: CourseLessonQuiz,
  progress: QuizProgress,
): CourseLessonQuiz {
  const seed = progress.seed ?? null;
  return seed === null ? askable : shuffleQuiz(askable, seed);
}

/**
 * Whether restored progress still describes the quiz as it exists now.
 *
 * Admins edit quizzes live, so progress stored on Monday can refer on
 * Wednesday to a question that no longer exists, an option that was deleted,
 * or an index past the end of a shortened quiz. Rather than repair such a
 * state, we discard it and let the student start over — a wrong restore silently
 * mis-scores them, which is worse than a visible restart.
 *
 * The invariant enforced is the one the UI can actually produce: the answered
 * questions are exactly the first N, in order, and the cursor sits either on
 * question N (nothing revealed) or on question N-1 (its wrong answer revealed).
 */
export function restoreQuizProgress(
  stored: QuizProgress | null | undefined,
  askable: CourseLessonQuiz,
): QuizProgress | null {
  if (!stored) return null;

  const answeredIds = Object.keys(stored.answers);
  const prefix = askable.slice(0, answeredIds.length);

  // Answered set must be exactly the first N questions, in order.
  if (prefix.length !== answeredIds.length) return null;
  for (const question of prefix) {
    const chosen = stored.answers[question.id];
    if (chosen === undefined) return null;
    if (!question.options.some((option) => option.id === chosen)) return null;
  }

  if (stored.revealedQuestionId === null) {
    return stored.index === answeredIds.length ? stored : null;
  }

  const last = prefix.at(-1);
  if (!last || last.id !== stored.revealedQuestionId) return null;
  return stored.index === answeredIds.length - 1 ? stored : null;
}

/**
 * The payload persisted for an attempt: a full snapshot of each question
 * alongside the option the student chose.
 *
 * Snapshotting is the point of the column — a review rendered against a quiz
 * the admin has since edited would mark a student wrong for an answer that was
 * right when they gave it.
 */
export function buildQuizAnswers(
  askable: CourseLessonQuiz,
  answers: QuizAnswerMap,
): CourseLessonQuizAnswers {
  return askable.map((question) => ({
    ...question,
    userOptionId: answers[question.id],
  }));
}

export type QuizScore = { correct: number; total: number };

export function scoreQuizAnswers(answers: CourseLessonQuizAnswers): QuizScore {
  return {
    correct: answers.filter(
      (answer) => answer.userOptionId === answer.correctOptionId,
    ).length,
    total: answers.length,
  };
}

export function quizGradeLabel({ correct, total }: QuizScore): string {
  if (total === 0) return 'No questions';
  if (correct === total) return 'Perfect score!';
  if (correct >= total * 0.7) return 'Great job!';
  return 'Keep practicing!';
}

/** How a single option should render once a question has been answered. */
export type QuizOptionState = 'idle' | 'correct' | 'wrong' | 'dimmed';

/**
 * `showAnswer` false: a wrong pick marks only the pick, and the correct option
 * stays unmarked — showing it would let the next attempt be memorised. The
 * quiz itself never shows the answer; the end-of-quiz review does, and only
 * after a perfect score (when every pick already is the answer).
 */
export function quizOptionState({
  optionId,
  correctOptionId,
  chosenOptionId,
  revealed,
  showAnswer,
}: {
  optionId: string;
  correctOptionId: string;
  chosenOptionId: string | undefined;
  revealed: boolean;
  showAnswer: boolean;
}): QuizOptionState {
  if (!revealed) return 'idle';
  if (optionId === chosenOptionId) {
    return optionId === correctOptionId ? 'correct' : 'wrong';
  }
  if (showAnswer && optionId === correctOptionId) return 'correct';
  return 'dimmed';
}

/**
 * What the live region announces after an answer. The reveal is otherwise
 * purely visual, so a screen-reader user would hear nothing at all. A wrong
 * answer is never followed by the right one — see `quizOptionState`.
 */
export function revealAnnouncement(
  question: CourseLessonQuizQuestion,
  chosenOptionId: string,
): string {
  return chosenOptionId === question.correctOptionId
    ? 'Correct.'
    : 'Incorrect.';
}
