/**
 * The debrief's set rules (user, 2026-11-18). Pure and client-safe: the
 * answer route and the Debrief tab both read them.
 *
 * An attempt asks up to eight key points, drawn without repeats, in sets of
 * four. Viper gives feedback on every answer as it lands. A set whose answers
 * is judged by a `SetJudge` (the course's pass mark) on the better average so
 * far. A miss opens the next set; a pass on set 1 offers set 2 to improve on.
 * `DEBRIEF_SET_PASS_SCORE` now only sets the per-answer verdict and tone.
 */

export const DEBRIEF_SET_SIZE = 4;
export const DEBRIEF_SET_PASS_SCORE = 75;

/** Question ids in order, cut into sets of `DEBRIEF_SET_SIZE`. */
export function splitIntoSets(questionIds: readonly string[]): string[][] {
  const sets: string[][] = [];
  for (let i = 0; i < questionIds.length; i += DEBRIEF_SET_SIZE) {
    sets.push(questionIds.slice(i, i + DEBRIEF_SET_SIZE));
  }
  return sets;
}

/** The rounded mean of a set's scores. */
export function setAverage(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Judges a set's (best-so-far) average against the course's pass mark. */
export type SetJudge = (average: number) => boolean;

/**
 * The averages of fully answered sets, in order, stopping at the first set
 * not yet complete. Judge-free: it says nothing about passing.
 */
export function completedSetAverages(
  sets: readonly (readonly string[])[],
  scoreOf: ReadonlyMap<string, number>,
): number[] {
  const averages: number[] = [];
  for (const ids of sets) {
    if (ids.length === 0 || !ids.every((id) => scoreOf.has(id))) break;
    averages.push(setAverage(ids.map((id) => scoreOf.get(id) ?? 0)));
  }
  return averages;
}

export type SetOutcome = {
  /** 1-based. */
  set: number;
  average: number;
  /** The judge on the better average so far, not this set's own. */
  passed: boolean;
};

export type SetsProgress = {
  /** One per set whose every question is answered, in order. */
  completed: SetOutcome[];
  /**
   * How many sets the pilot may see: set 1; set 2 after a miss, or after a
   * pass the pilot chose to improve on; never past the last.
   */
  reached: number;
  /** Some completed set passed. */
  passed: boolean;
  /** The highest completed average. */
  best: number | null;
  /** Set 1 passed, a set 2 exists, and the pilot has not taken it up. */
  offer: boolean;
  /**
   * Nothing more to ask: every set is done. Declining an offer is recorded
   * by the caller finishing the row.
   */
  over: boolean;
};

/**
 * Where an attempt stands. A set passes when `judge` accepts the better
 * average of it and every earlier completed set. A passed set 1 does not
 * open set 2 until `improveAccepted`.
 */
export function setsProgress(
  sets: readonly (readonly string[])[],
  scoreOf: ReadonlyMap<string, number>,
  judge: SetJudge,
  opts: { improveAccepted: boolean },
): SetsProgress {
  let averages = completedSetAverages(sets, scoreOf);
  const firstPassed = averages.length > 0 && judge(averages[0] ?? 0);
  const hasSet2 = sets.length > 1;
  // A passed set 1 not taken up: later answers, if any, are not part of it.
  if (firstPassed && hasSet2 && !opts.improveAccepted) {
    averages = averages.slice(0, 1);
  }
  let best = Number.NEGATIVE_INFINITY;
  const completed: SetOutcome[] = averages.map((average, i) => {
    best = Math.max(best, average);
    return { set: i + 1, average, passed: judge(best) };
  });
  const offer =
    firstPassed && hasSet2 && !opts.improveAccepted && completed.length === 1;
  const over = sets.length > 0 && completed.length === sets.length;
  return {
    completed,
    reached: offer
      ? 1
      : over
        ? completed.length
        : Math.min(completed.length + 1, sets.length),
    passed: completed.some((c) => c.passed),
    best: completed.length > 0 ? best : null,
    offer,
    over,
  };
}

/** The four-word verdict Viper's feedback leads with. */
export type AnswerVerdict = 'Strong' | 'Mostly there' | 'Partly' | 'Missed';

export function answerVerdict(score: number): AnswerVerdict {
  if (score >= 85) return 'Strong';
  if (score >= DEBRIEF_SET_PASS_SCORE) return 'Mostly there';
  if (score >= 40) return 'Partly';
  return 'Missed';
}
