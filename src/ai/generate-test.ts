import { generateText, Output } from 'ai';
import { DEBRIEF_QUESTION_COUNT, DEBRIEF_SET_SIZE } from '#/lib/debrief-sets';
import { haiku, sonnet } from './ai-provider';
import { evaluatorPrompt } from './prompts/evaluator';
import { generationPrompt } from './prompts/generation';
import { optimizerPrompt } from './prompts/optimizer';
import {
  type AITest,
  type AITestFreeTextQuestion,
  AITestGenerationOutputSchema,
  type EvaluatorOutput,
  EvaluatorOutputSchema,
} from './schemas';

const MAX_RETRIES = 2;

async function generate(
  keyPoints: string[],
  text: string,
): Promise<AITestFreeTextQuestion[]> {
  const { output } = await generateText({
    model: sonnet,
    output: Output.object({
      schema: AITestGenerationOutputSchema,
    }),
    prompt: generationPrompt({
      keyPoints,
      text,
      questionCount: DEBRIEF_QUESTION_COUNT,
      setSize: DEBRIEF_SET_SIZE,
    }),
  });
  return output.questions;
}

async function evaluate(
  keyPoints: string[],
  text: string,
  questions: AITestFreeTextQuestion[],
): Promise<EvaluatorOutput> {
  const { output } = await generateText({
    model: haiku,
    output: Output.object({
      schema: EvaluatorOutputSchema,
    }),
    prompt: evaluatorPrompt({ keyPoints, text, questions }),
  });
  return output;
}

async function optimize(
  keyPoints: string[],
  text: string,
  failedQuestions: AITestFreeTextQuestion[],
  evaluatorFeedback: EvaluatorOutput['results'],
): Promise<AITestFreeTextQuestion[]> {
  const { output } = await generateText({
    model: sonnet,
    output: Output.object({
      schema: AITestGenerationOutputSchema,
    }),
    prompt: optimizerPrompt({
      keyPoints,
      text,
      failedQuestions,
      evaluatorFeedback,
    }),
  });
  return output.questions;
}

/**
 * A debrief: six written questions, the first set of three then the second
 * (see `debriefSetsProgress` for when the second is asked). Written answers
 * only — a pilot explains, they do not pick.
 *
 * Generate with Sonnet, quality-check with Haiku, regenerate failures with
 * Sonnet (at most twice). A regenerated question takes its original's slot,
 * so a question written for the second set never moves into the first.
 */
export async function generateTest(
  lessonSlug: string,
  keyPoints: string[],
  text: string,
): Promise<AITest> {
  let questions = (await generate(keyPoints, text)).slice(
    0,
    DEBRIEF_QUESTION_COUNT,
  );

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { results } = await evaluate(keyPoints, text, questions);
    const failedIds = new Set(
      results.filter((r) => !r.pass).map((r) => r.questionId),
    );
    if (failedIds.size === 0) break;

    const failedQuestions = questions.filter((q) => failedIds.has(q.id));
    const regenerated = await optimize(
      keyPoints,
      text,
      failedQuestions,
      results.filter((r) => !r.pass),
    );
    // In order, one for one; a failure the optimiser returned nothing for
    // keeps its original rather than shrinking the debrief.
    let next = 0;
    questions = questions.map((q) =>
      failedIds.has(q.id) ? (regenerated[next++] ?? q) : q,
    );
  }

  return { lessonSlug, questions };
}
