import { generateObject } from 'ai';
import { sonnet } from './ai-provider';
import { evaluationPrompt } from './prompts/evaluation';
import {
  type AIEvaluationResult,
  type AIFreeTextEvalOutput,
  AIFreeTextEvalOutputSchema,
  type AITestFreeTextQuestion,
  type AITestMCQQuestion,
} from './schemas';

// Deterministic MCQ evaluation — no AI call
export function evaluateMCQ(
  question: AITestMCQQuestion,
  userAnswer: string,
): AIEvaluationResult {
  const correctOption = question.options.find(
    (o) => o.id === question.correctOptionId,
  );
  const isCorrect = userAnswer === question.correctOptionId;

  return {
    questionId: question.id,
    type: 'mcq',
    score: isCorrect ? 100 : 0,
    userAnswer,
    explanation: `The correct answer is: ${correctOption?.value ?? question.correctOptionId}`,
  };
}

const CONVEYED_CREDIT = { fully: 1, partly: 0.5, not: 0 } as const;
/** What each factually wrong or unsafe statement costs, in score points. */
const INCORRECT_CLAIM_PENALTY = 25;

/**
 * The 0–100 score for a free-text answer, from the grader's judgements.
 *
 * Credit is the share of essential ideas the student conveyed — a "partly"
 * counts half — less a fixed penalty per incorrect claim. Computed here rather
 * than asked of the model so that two answers meaning the same thing score the
 * same, however each is worded; see AIFreeTextEvalOutputSchema.
 */
export function scoreFreeTextEval({
  essentialIdeas,
  incorrectClaims,
}: Pick<AIFreeTextEvalOutput, 'essentialIdeas' | 'incorrectClaims'>): number {
  if (essentialIdeas.length === 0) return 0;
  const credit =
    essentialIdeas.reduce((sum, i) => sum + CONVEYED_CREDIT[i.conveyed], 0) /
    essentialIdeas.length;
  const score = credit * 100 - incorrectClaims.length * INCORRECT_CLAIM_PENALTY;
  return Math.round(Math.min(100, Math.max(0, score)));
}

// AI-powered free-text evaluation — calls Sonnet
export async function evaluateFreeText(
  question: AITestFreeTextQuestion,
  userAnswer: string,
  keyPoints: string[],
  text: string,
): Promise<AIEvaluationResult> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AIFreeTextEvalOutputSchema,
    prompt: evaluationPrompt({
      question: question.question,
      expectedAnswer: question.expectedAnswer,
      userAnswer,
      keyPoints,
      text,
    }),
  });

  return {
    questionId: question.id,
    type: 'free-text',
    score: scoreFreeTextEval(object),
    userAnswer,
    explanation: object.explanation,
  };
}
