import type { SetJudge } from '#/lib/debrief-sets';

/**
 * A lesson's total score, 0..100, from how much of each part the pilot
 * earned. Pure and client-safe.
 *
 * Video is half the score when the lesson has one; the other present parts
 * split the rest evenly (the whole 100 when there is no video).
 */

export type ScorePartName = 'video' | 'quiz' | 'debrief';

/** 0..1 per part; null = the lesson does not have that part. */
export type ScoreFractions = Record<ScorePartName, number | null>;

export type ScorePart = {
  part: ScorePartName;
  weight: number;
  fraction: number;
  points: number;
};

export type LessonScore = {
  total: number;
  passMark: number;
  passed: boolean;
  parts: ScorePart[];
};

const ORDER: readonly ScorePartName[] = ['video', 'quiz', 'debrief'];
const VIDEO_WEIGHT = 50;

export function lessonTotalScore(
  f: ScoreFractions,
  passMark: number,
): LessonScore {
  const present = ORDER.filter((p) => f[p] !== null);
  const others = present.filter((p) => p !== 'video');
  const share =
    others.length === 0
      ? 0
      : (present.includes('video') ? 100 - VIDEO_WEIGHT : 100) / others.length;
  const parts: ScorePart[] = present.map((part) => {
    const weight = part === 'video' ? VIDEO_WEIGHT : share;
    const fraction = f[part] ?? 0;
    return {
      part,
      weight: part === 'video' && others.length === 0 ? 100 : weight,
      fraction,
      points: 0,
    };
  });
  for (const p of parts) p.points = p.weight * p.fraction;
  // No parts at all: nothing to earn, so nothing to miss.
  const total =
    parts.length === 0 ? 100 : parts.reduce((a, p) => a + p.points, 0);
  return { total, passMark, passed: total >= passMark, parts };
}

/** One decimal ("85.5"); whole numbers without ".0" ("50"). */
export function formatScore(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** The parts a debrief set does not change: the lesson's video and quiz. */
export type ScoreFacts = Pick<ScoreFractions, 'video' | 'quiz'>;

/**
 * The lesson total with `average` (0..100) as the debrief part. The debrief
 * always counts here, whether or not the lesson's debrief switch is on: this
 * is the score a set is judged on.
 */
export function setScore(
  facts: ScoreFacts,
  passMark: number,
  average: number,
): LessonScore {
  return lessonTotalScore({ ...facts, debrief: average / 100 }, passMark);
}

/** A set passes when its (best-so-far) average lifts the lesson total to the pass mark. */
export function debriefJudge(facts: ScoreFacts, passMark: number): SetJudge {
  return (average) => setScore(facts, passMark, average).passed;
}
