import type { CourseLessonQuizAnswers } from '#/types';

/**
 * Whether a finished local attempt should be POSTed right now.
 *
 * Extracted so this — the "dangerous one" per Task 14's brief — can be tested
 * without `renderHook`, which this repo's Vite pipeline breaks for any hook
 * calling a raw React hook (see use-record-last-viewed.ts for the same
 * split). `LessonQuizContainer`'s auto-submit effect fires from a rendered
 * state, not a button press, so `readOnly` has to be checked here rather than
 * only in the UI that would otherwise trigger it — hiding the retake/submit
 * controls would not stop this effect from writing.
 *
 * `readOnly` is checked first and short-circuits everything else: an archive
 * view must never submit, no matter what local progress happens to be sitting
 * in localStorage from before the pilot's level changed.
 */
export function shouldAutoSubmitQuiz({
  pendingAnswers,
  alreadySubmitted,
  isPending,
  readOnly,
}: {
  pendingAnswers: CourseLessonQuizAnswers | null;
  alreadySubmitted: boolean;
  isPending: boolean;
  readOnly: boolean;
}): boolean {
  if (readOnly) return false;
  if (!pendingAnswers || alreadySubmitted || isPending) return false;
  return true;
}
