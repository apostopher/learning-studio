import { z } from 'zod';
import { AIEvaluationResultSchema, AITestSchema } from '#/ai/schemas';

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
  essentialIdeas?: { idea: string; conveyed: 'fully' | 'partly' | 'not' }[];
  incorrectClaims?: string[];
};

const answersSchema = z.array(AIEvaluationResultSchema);

/**
 * The ONE projection of a stored attempt's `questions` / `answers` JSON for
 * anything a client can receive. A chunk-format attempt stores its grading
 * key in `questions` (expected answers, chunk tags, chunk summaries and the
 * lesson context); a pilot who read it after an attempt would have the
 * rubric for their remaining holes. Fields are picked one by one, never
 * spread, so a field added to the stored shape stays server-side.
 * Unreadable JSON gives empty arrays.
 */
export function toClientAttempt(row: {
  questions: unknown;
  answers: unknown;
}): {
  questions: ClientAttemptQuestion[];
  evaluations: ClientEvaluation[];
} {
  const test = AITestSchema.safeParse(row.questions);
  const answers = answersSchema.safeParse(row.answers);
  return {
    questions: test.success
      ? test.data.questions.map((q) => ({ id: q.id, question: q.question }))
      : [],
    evaluations: answers.success
      ? answers.data.map((e) => ({
          questionId: e.questionId,
          type: e.type,
          score: e.score,
          userAnswer: e.userAnswer,
          explanation: e.explanation,
          ...(e.revisitNote !== undefined && { revisitNote: e.revisitNote }),
          ...(e.essentialIdeas !== undefined && {
            essentialIdeas: e.essentialIdeas.map((i) => ({
              idea: i.idea,
              conveyed: i.conveyed,
            })),
          }),
          ...(e.incorrectClaims !== undefined && {
            incorrectClaims: e.incorrectClaims,
          }),
        }))
      : [],
  };
}

/**
 * "Worth revisiting": the grader's note on each answer, in question order,
 * each once, empty ones dropped. An answer that cleared its chunk carries no
 * note (the grader writes none), so only holes are listed.
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
