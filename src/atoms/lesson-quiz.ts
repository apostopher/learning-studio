import { atomWithStorage } from 'jotai/utils';
import { atomFamily } from 'jotai-family';
import { emptyQuizProgress, type QuizProgress } from '#/lib/lesson-quiz';

/**
 * Mid-quiz progress for the lesson's authored quiz, persisted per user per
 * lesson.
 *
 * Keyed rather than global on purpose: the AI-test atoms next door
 * (`currentQuestionIndexAtom`, `evaluationsAtom`) are module-level singletons
 * with no lesson key and nothing resetting them on navigation, so a student who
 * abandons lesson A on question 3 opens lesson B on question 3 of B. Keying
 * makes that unrepresentable.
 *
 * The key includes the user id because localStorage is per-browser, not
 * per-account — two students sharing a laptop would otherwise inherit each
 * other's half-finished quiz, and the second one's submission would carry the
 * first one's answers.
 *
 * `getOnInit` reads storage during atom creation, so anything reading this must
 * be client-only (see `ClientGate` in `lesson-quiz-container.tsx`) or the
 * server render and the first client render disagree.
 *
 * Entries are never evicted; a long session across many lessons holds one small
 * object per visited lesson. Accepted.
 */
export const quizProgressAtomFamily = atomFamily((key: string) =>
  atomWithStorage<QuizProgress>(
    `quiz-progress:${key}`,
    emptyQuizProgress,
    undefined,
    { getOnInit: true },
  ),
);

/** Storage key for one student's attempt at one lesson. */
export const quizProgressKey = (userId: string, lessonSlug: string) =>
  `${userId}:${lessonSlug}`;
