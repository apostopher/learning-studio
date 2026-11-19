import { atom } from 'jotai';
import type { FinishedDebrief } from '#/components/lesson-material/compute-debrief-panel';
import type { SetOutcome } from '#/lib/debrief-sets';

/**
 * The debrief attempt finished while the pilot has been on its lesson: what
 * its score report shows. Set the moment the last answer is graded, it only
 * bridges the moment before the status refetch lands — an open-for-retake
 * status then carries the same report from the server (mastery and revisit
 * notes), which is what a reload or a later visit shows. Cleared when the
 * pilot leaves the lesson (LessonMaterialWrapper), and when the debrief
 * reopens while the page stays open (`isStaleFinishedDebrief`).
 */
export const justFinishedDebriefAtom = atom<FinishedDebrief | null>(null);

/**
 * Viper's feedback on the answer just graded, on screen until the pilot
 * presses Next. Keyed on the lesson and attempt, so it never shows anywhere
 * else. `report` is set when this answer finished the attempt: Next then
 * hands it to `justFinishedDebriefAtom`, so the report waits until the
 * feedback has been read.
 */
export type DebriefFeedbackShown = {
  lessonSlug: string;
  attemptId: number;
  questionId: string;
  position: string;
  question: string;
  answer: string;
  score: number;
  feedback: string;
  setResult: SetOutcome | null;
  /** `feedbackNextLabel`. */
  nextLabel: string;
  report: FinishedDebrief | null;
};
export const debriefFeedbackAtom = atom<DebriefFeedbackShown | null>(null);

/**
 * Next was pressed on the feedback: the next question's answer box takes
 * focus as it mounts (React's `autoFocus`, mount only, so a refetch never
 * moves it). Reset on the next submit.
 */
export const debriefFocusAnswerAtom = atom(false);

/**
 * The lesson whose debrief the pilot pressed Start on. Starting asks the
 * server to write the questions (a model call), so it waits for the press;
 * an attempt already open resumes without one.
 */
export const debriefStartRequestedAtom = atom<string | null>(null);

/**
 * The start route's last 409 for this lesson ("not open"), with the time it
 * gave. Kept in an atom, not read off the query error, so it outlives the
 * Start press being cleared: the quiz shows the countdown, never Start again
 * with no reason (`debriefQuizView`). Cleared when an attempt loads, and
 * when the panel leaves `take`.
 */
export const debriefNotOpenAtom = atom<{
  lessonSlug: string;
  availableAt: string | null;
} | null>(null);

/** A paste, drop, copy or cut was just refused in the answer box. */
export const debriefPasteBlockedAtom = atom(false);

/**
 * The live countdown: ms left until `availableAt`, written by the
 * container's ref timer on each tick. Keyed by the instant it counts to, so a
 * value left over from another countdown is never shown.
 */
export const debriefCountdownAtom = atom<{
  availableAt: string;
  msLeft: number;
} | null>(null);

/**
 * What the countdown's visually hidden status says: set once when the
 * countdown starts, not on every tick, so screen readers hear it once.
 */
export const debriefCountdownAnnouncementAtom = atom('');

/**
 * The panel-wide status sentence, set once when a countdown runs out and the
 * debrief opens. It lives in a region the panel always renders, because the
 * countdown that would have said it is gone by then.
 */
export const debriefOpenedAnnouncementAtom = atom('');
