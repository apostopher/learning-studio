import { atom } from 'jotai';
import type { FinishedDebrief } from '#/components/lesson-material/compute-debrief-panel';

/**
 * The debrief attempt finished while the pilot has been on its lesson: what
 * its score report shows. Set the moment the last answer is graded, so the
 * report survives the status moving on to retake-waiting or passed. Cleared
 * when the pilot leaves the lesson (LessonMaterialWrapper), so a later visit
 * during the wait shows the countdown alone; and when the debrief reopens
 * while the page stays open (`isStaleFinishedDebrief`).
 */
export const justFinishedDebriefAtom = atom<FinishedDebrief | null>(null);

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
