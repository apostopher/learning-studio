import { DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';

/** Essays per set. */
export const DEBRIEF_SET_SIZE = 3;
/** A debrief is generated with both sets up front, so set 2 never waits on a model. */
export const DEBRIEF_QUESTION_COUNT = DEBRIEF_SET_SIZE * 2;

export type DebriefSetsProgress = {
  /** Questions the pilot is asked in this attempt: one set, or both. */
  asked: number;
  /** Every asked question is answered — the attempt is ready to save. */
  complete: boolean;
  /** The first set came in under par, so the second set is part of this attempt. */
  secondSet: boolean;
  /** The attempt's score: the mean of every answer so far, rounded. */
  score: number;
};

const mean = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Where one debrief attempt stands, from the scores of the answers given so
 * far (in question order).
 *
 * Three essays first. An average at par passes on those alone. Below par, a
 * second set of three follows in the same sitting, and the attempt is judged
 * on the average of all six. A test shorter than two sets (or one) asks what
 * it holds.
 */
export function debriefSetsProgress(
  scores: readonly number[],
  questionCount: number,
): DebriefSetsProgress {
  const firstSet = Math.min(DEBRIEF_SET_SIZE, questionCount);
  const firstSetDone = scores.length >= firstSet;
  const secondSet =
    firstSetDone &&
    questionCount > firstSet &&
    mean(scores.slice(0, firstSet)) < DEBRIEF_PAR_SCORE;
  const asked = secondSet
    ? Math.min(DEBRIEF_QUESTION_COUNT, questionCount)
    : firstSet;
  return {
    asked,
    complete: scores.length >= asked,
    secondSet,
    score: mean(scores.slice(0, asked)),
  };
}
