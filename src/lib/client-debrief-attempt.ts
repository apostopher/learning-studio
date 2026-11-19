import { z } from 'zod';
import { AIEvaluationResultSchema, AITestSchema } from '#/ai/schemas';
import { completedSetAverages } from '#/lib/debrief-sets';

/** A question as the pilot may see it: never its rubric or chunk tags. */
export type ClientAttemptQuestion = { id: string; question: string };

/**
 * An answer's grade as the pilot may see it. Legacy fields
 * (`essentialIdeas`, `explanation`) stay so old attempts still render;
 * `chunkScores` (chunk ids) never leaves the server.
 */
export type ClientEvaluation = {
  questionId: string;
  type: 'mcq' | 'free-text';
  score: number;
  userAnswer: string;
  explanation: string;
  revisitNote?: string;
  /** Viper's feedback (set-format answers only). */
  feedback?: string;
  essentialIdeas?: { idea: string; conveyed: 'fully' | 'partly' | 'not' }[];
  incorrectClaims?: string[];
};

const answersSchema = z.array(AIEvaluationResultSchema);
const setsSchema = z.object({ sets: z.array(z.array(z.string())) });

/**
 * The ONE projection of a stored attempt's `questions` / `answers` JSON for
 * anything a client can receive. A chunk-format attempt stores its grading
 * key in `questions` (expected answers, chunk tags, chunk summaries and the
 * lesson context); a pilot who read it after an attempt would have the
 * rubric for their remaining holes. Fields are picked one by one, never
 * spread, so a field added to the stored shape stays server-side.
 *
 * A set-format attempt keeps only the questions of sets the pilot has
 * started (set 1 always): an unasked set 2 is never shown, and `setAverages` holds each
 * completed set's average. Older attempts show every question and have no
 * set averages. Unreadable JSON gives empty arrays.
 */
export function toClientAttempt(row: {
  questions: unknown;
  answers: unknown;
}): {
  questions: ClientAttemptQuestion[];
  evaluations: ClientEvaluation[];
  setAverages: number[];
} {
  const test = AITestSchema.safeParse(row.questions);
  const answers = answersSchema.safeParse(row.answers);
  const sets = setsSchema.safeParse(row.questions);
  const evaluations = answers.success ? answers.data : [];
  const scoreOf = new Map(evaluations.map((e) => [e.questionId, e.score]));
  // A set is shown once it has an answer; set 1 is always shown.
  const shown = sets.success
    ? new Set(
        sets.data.sets
          .filter((ids, i) => i === 0 || ids.some((id) => scoreOf.has(id)))
          .flat(),
      )
    : null;
  return {
    questions: test.success
      ? test.data.questions
          .filter((q) => shown === null || shown.has(q.id))
          .map((q) => ({ id: q.id, question: q.question }))
      : [],
    evaluations: evaluations.map((e) => ({
      questionId: e.questionId,
      type: e.type,
      score: e.score,
      userAnswer: e.userAnswer,
      explanation: e.explanation,
      ...(e.revisitNote !== undefined && { revisitNote: e.revisitNote }),
      ...(e.feedback !== undefined && { feedback: e.feedback }),
      ...(e.essentialIdeas !== undefined && {
        essentialIdeas: e.essentialIdeas.map((i) => ({
          idea: i.idea,
          conveyed: i.conveyed,
        })),
      }),
      ...(e.incorrectClaims !== undefined && {
        incorrectClaims: e.incorrectClaims,
      }),
    })),
    setAverages: sets.success
      ? completedSetAverages(sets.data.sets, scoreOf)
      : [],
  };
}

/**
 * "Worth revisiting": the grader's note on each answer, in question order,
 * each once, empty ones dropped. An answer that cleared its chunk carries no
 * note (the grader writes none), so only answers with something to add are
 * listed.
 */
export function revisitNotesOf(
  questions: readonly { id: string }[],
  evaluations: readonly { questionId: string; revisitNote?: string }[],
): string[] {
  const notes = new Set<string>();
  for (const question of questions) {
    for (const e of evaluations) {
      if (e.questionId !== question.id) continue;
      const note = e.revisitNote?.trim();
      if (note) notes.add(note);
    }
  }
  return [...notes];
}
