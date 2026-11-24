import { atom } from 'jotai';
import type { FinishedDebrief } from '#/components/lesson-material/compute-debrief-panel';
import type { DebriefScoredSet } from '#/data-hooks/use-debrief-attempt';

/**
 * The debrief attempt finished while the pilot has been on its lesson: what
 * its score report shows. Set when the pilot presses "See your result" (or
 * says No to the offer). It stays: a failed attempt leaves the status `open`
 * for an immediate retake, so the status never dismisses the report. Cleared
 * when the pilot leaves the lesson (LessonMaterialWrapper) or starts another
 * attempt (`startDebriefAttemptAtom`).
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
  /** The set this answer completed, with the lesson total it was judged on. */
  setResult: DebriefScoredSet | null;
  /** `feedbackPrompt`: introduces set 2 after a missed set 1, else ''. */
  prompt: string;
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
 * Start a new attempt on `lessonSlug` (the intro's Start, or Retake now after
 * two misses). The last attempt's report and feedback are taken down first:
 * the report would otherwise hold the panel on `finished` (it outranks the
 * status), and the new attempt would never show.
 */
export const startDebriefAttemptAtom = atom(
  null,
  (_get, set, lessonSlug: string) => {
    set(justFinishedDebriefAtom, null);
    set(debriefFeedbackAtom, null);
    set(debriefStartRequestedAtom, lessonSlug);
    // The button pressed is gone once the attempt loads: the first
    // question's answer box takes focus instead of the page losing it.
    set(debriefFocusAnswerAtom, true);
  },
);

/**
 * Later, after two misses: the retake prompt closes and the report stays.
 * The retake is open whenever the pilot comes back to the lesson.
 */
export const debriefRetakeLaterAtom = atom(null, (get, set) => {
  const report = get(justFinishedDebriefAtom);
  if (report?.note === 'retake') {
    set(justFinishedDebriefAtom, { ...report, note: null });
  }
});

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
 * The panel-wide status sentence, set once when the 12 h wait ends and the
 * debrief opens. It lives in a region the panel always renders, because the
 * wait panel that would have said it is gone by then.
 */
export const debriefOpenedAnnouncementAtom = atom('');
