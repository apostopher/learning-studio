/**
 * The debrief's set rules (user, 2026-11-18). Pure and client-safe: the
 * answer route and the Debrief tab both read them.
 *
 * An attempt asks up to eight key points, drawn without repeats, in sets of
 * four. Viper gives feedback on every answer as it lands. A set whose answers
 * average `DEBRIEF_SET_PASS_SCORE` or more passes the debrief and ends the
 * attempt; a set below it opens the next set, if there is one; the last set
 * below it ends the attempt unpassed. Each set is judged on its own.
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

export type SetOutcome = {
  /** 1-based. */
  set: number;
  average: number;
  passed: boolean;
};

export type SetsProgress = {
  /** One per set whose every question is answered, in order. */
  completed: SetOutcome[];
  /**
   * How many sets the pilot may see: the first, plus one more after each
   * completed set that missed — never past the last.
   */
  reached: number;
  /** A completed set passed: the debrief is passed and the attempt is over. */
  passed: boolean;
  /** Passed, or the last set is done: nothing more to ask. */
  over: boolean;
};

/**
 * Where an attempt stands, from its sets and the scores recorded so far.
 * Sets are answered in order, so the walk stops at the first one not yet
 * complete, and at the first that passed.
 */
export function setsProgress(
  sets: readonly (readonly string[])[],
  scoreOf: ReadonlyMap<string, number>,
): SetsProgress {
  const completed: SetOutcome[] = [];
  for (const [i, ids] of sets.entries()) {
    if (ids.length === 0 || !ids.every((id) => scoreOf.has(id))) break;
    const average = setAverage(ids.map((id) => scoreOf.get(id) ?? 0));
    const passed = average >= DEBRIEF_SET_PASS_SCORE;
    completed.push({ set: i + 1, average, passed });
    if (passed) break;
  }
  const passed = completed.at(-1)?.passed ?? false;
  const over = passed || (sets.length > 0 && completed.length === sets.length);
  return {
    completed,
    reached: over
      ? completed.length
      : Math.min(completed.length + 1, sets.length),
    passed,
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
