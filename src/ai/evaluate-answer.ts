import { generateObject } from 'ai';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { sonnet } from './ai-provider';
import { evaluationPrompt } from './prompts/evaluation';
import {
  type AIEvaluationResult,
  AIFreeTextEvalOutputSchema,
  type AITestFreeTextQuestion,
  type ChunkJudgement,
} from './schemas';

/**
 * `mostly` clears the chunk (CHUNK_CLEAR_SCORE is 70): the core understanding
 * is there and only a secondary detail is missing, which the revisit note
 * still logs for Viper. Without it a strong answer missing one nuance scored
 * 50 and failed, the same as a vague one.
 */
const CONVEYED_CREDIT = { fully: 100, mostly: 80, partly: 50, not: 0 } as const;
/** What each factually wrong or unsafe statement costs, in score points. */
const INCORRECT_CLAIM_PENALTY = 25;
/**
 * The most the penalties may take, as a share of what the chunk earned. Past
 * this, a single flagged claim could zero a chunk the answer credits the
 * student with — a number that contradicts its own feedback.
 */
const MAX_PENALTY_SHARE = 0.5;

/**
 * The 0–100 score for one chunk, from the grader's judgement: fully 100,
 * mostly 80, partly 50, not 0, less 25 per incorrect claim, the penalties together taking
 * at most half of what was earned. Computed here rather than asked of the
 * model so two answers meaning the same thing score the same, however worded.
 */
export function scoreChunkJudgement(
  j: Pick<ChunkJudgement, 'conveyed'>,
  incorrectClaims: number,
): number {
  const earned = CONVEYED_CREDIT[j.conveyed];
  const penalty = Math.min(
    incorrectClaims * INCORRECT_CLAIM_PENALTY,
    earned * MAX_PENALTY_SHARE,
  );
  return Math.round(Math.max(0, earned - penalty));
}

const normalise = (t: string) =>
  t
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The grader's incorrect claims that quote the student's own words. A claim
 * whose quote is not in the answer is about something the student never said
 * — the grader once docked an answer for a "Red Baron" remark it invented —
 * so it is dropped rather than charged.
 */
export function groundedClaims(
  claims: { quote: string; problem: string }[],
  userAnswer: string,
): string[] {
  const answer = normalise(userAnswer);
  return claims
    .filter((c) => {
      const q = normalise(c.quote);
      return q.length > 0 && answer.includes(q);
    })
    .map((c) => `"${c.quote.trim()}" — ${c.problem.trim()}`);
}

// AI-powered free-text evaluation — judges ONLY the chunks the question cites
export async function evaluateFreeText(
  question: AITestFreeTextQuestion,
  userAnswer: string,
  chunks: KnowledgeChunk[],
  context: string,
): Promise<AIEvaluationResult> {
  if (!question.chunkIds || question.chunkIds.length === 0) {
    throw new Error(
      `Question ${question.id} has no chunkIds; only chunk-tagged questions can be graded`,
    );
  }
  const judged = question.chunkIds
    .map((id) => chunks.find((c) => c.id === id))
    .filter((c): c is KnowledgeChunk => c !== undefined);
  if (judged.length === 0) {
    throw new Error(
      `None of question ${question.id}'s chunks (${question.chunkIds.join(', ')}) are in the lesson's chunks`,
    );
  }

  const { object } = await generateObject({
    model: sonnet,
    schema: AIFreeTextEvalOutputSchema,
    prompt: evaluationPrompt({
      question: question.question,
      expectedAnswer: question.expectedAnswer,
      userAnswer,
      chunks: judged,
      text: context,
    }),
  });

  // One score per cited chunk the lesson still has (an unknown id is left out, not zeroed); a chunk the grader skipped counts
  // as not conveyed, and judgements of chunks it was not asked about are dropped.
  const incorrectClaims = groundedClaims(object.incorrectClaims, userAnswer);
  const claims = incorrectClaims.length;
  const chunkScores: Record<string, number> = {};
  let allFully = true;
  for (const { id } of judged) {
    const j = object.chunkJudgements.find((x) => x.chunkId === id);
    if (j?.conveyed !== 'fully') allFully = false;
    chunkScores[id] = scoreChunkJudgement(j ?? { conveyed: 'not' }, claims);
  }
  const scores = Object.values(chunkScores);
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  // Enforced here, not only in the prompt: a note on a perfect answer is noise.
  const revisitNote = allFully && claims === 0 ? '' : object.revisitNote;

  return {
    questionId: question.id,
    type: 'free-text',
    score,
    userAnswer,
    explanation: revisitNote,
    chunkScores,
    revisitNote,
    incorrectClaims,
  };
}
