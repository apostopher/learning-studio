import { z } from 'zod';
import {
  type AIEvaluationResult,
  AIEvaluationResultSchema,
} from '#/ai/schemas';

export type DebriefGaps = {
  /** Ideas an answer conveyed only partly, or not at all. */
  missed: string[];
  /** Statements the grader flagged as wrong or unsafe. */
  incorrect: string[];
};

/**
 * The holes one attempt's answers show, from the grader's own judgements
 * (`essentialIdeas`, `incorrectClaims`), each listed once. What the score
 * report shows as "Worth revisiting", and what Viper is told to teach.
 * Answers saved before the judgements were kept contribute nothing.
 */
export function debriefGaps(
  evaluations: readonly AIEvaluationResult[],
): DebriefGaps {
  const missed = new Set<string>();
  const incorrect = new Set<string>();
  for (const e of evaluations) {
    for (const i of e.essentialIdeas ?? []) {
      if (i.conveyed !== 'fully') missed.add(i.idea);
    }
    for (const c of e.incorrectClaims ?? []) incorrect.add(c);
  }
  return { missed: [...missed], incorrect: [...incorrect] };
}

export type LessonGaps = DebriefGaps & { lessonName: string };

const storedAnswers = z.array(AIEvaluationResultSchema);

/**
 * One learner's current debrief gaps, lesson by lesson: each lesson's LATEST
 * completed attempt (a gap a later attempt closed is no longer a gap), the
 * newest lessons first, lessons with nothing to revisit left out.
 *
 * `rows` are completed attempts, newest first.
 */
export function recentLessonGaps(
  rows: readonly { lessonName: string; lessonSlug: string; answers: unknown }[],
  limit: number,
): LessonGaps[] {
  const seen = new Set<string>();
  const out: LessonGaps[] = [];
  for (const row of rows) {
    if (seen.has(row.lessonSlug)) continue;
    seen.add(row.lessonSlug);
    const parsed = storedAnswers.safeParse(row.answers);
    if (!parsed.success) continue;
    const gaps = debriefGaps(parsed.data);
    if (gaps.missed.length === 0 && gaps.incorrect.length === 0) continue;
    out.push({ lessonName: row.lessonName, ...gaps });
    if (out.length >= limit) break;
  }
  return out;
}
