/**
 * Which lesson a debrief session belongs to.
 *
 * `currentTestAtom` and its siblings (`currentQuestionIndexAtom`,
 * `evaluationsAtom`, `selectedOptionAtom`, `freeTextAnswerAtom`) are plain
 * GLOBAL atoms with no reset on lesson navigation. A session started on one
 * lesson therefore survives into the next one, where the container would
 * render it as if it were this lesson's: skipping `DebriefIntro` entirely and,
 * once complete, drawing a foreign `ScoreReport` under this lesson — with a
 * Retake that claims the pilot completed *this* one at an earlier level.
 *
 * `AITest` already carries its own `lessonSlug` — it is what `useSaveResults`
 * posts with — so ownership is decidable without keying five atoms by slug.
 *
 * Pure and in its own module for the same reason `shouldAutoSaveDebrief` is:
 * the container it guards uses `useRef`/`useEffect`, which this repo's vitest
 * setup cannot render (the React dispatcher is null under the compiler
 * transform), so the decision has to be testable on its own.
 */
export function debriefSessionForLesson<T extends { lessonSlug: string }>(
  session: T | null,
  lessonSlug: string,
): T | null {
  if (session === null) return null;
  return session.lessonSlug === lessonSlug ? session : null;
}
