import { generateText, Output } from 'ai';
import { haiku, sonnet } from './ai-provider';
import { balanceAnswerPositions, withLengthGiveaways } from './mcq-answer-bias';
import { evaluatorPrompt } from './prompts/evaluator';
import { generationPrompt } from './prompts/generation';
import { optimizerPrompt } from './prompts/optimizer';
import {
  type AITest,
  AITestGenerationOutputSchema,
  type AITestQuestion,
  type EvaluatorOutput,
  EvaluatorOutputSchema,
} from './schemas';

const MAX_RETRIES = 2;

async function generate(
  keyPoints: string[],
  text: string,
  questionCount: number,
  mcqCount: number,
  freeTextCount: number,
): Promise<AITestQuestion[]> {
  const { output } = await generateText({
    model: sonnet,
    output: Output.object({
      schema: AITestGenerationOutputSchema,
    }),
    prompt: generationPrompt({
      keyPoints,
      text,
      questionCount,
      mcqCount,
      freeTextCount,
    }),
  });
  return output.questions;
}

async function evaluate(
  keyPoints: string[],
  text: string,
  questions: AITestQuestion[],
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
  failedQuestions: AITestQuestion[],
  evaluatorFeedback: EvaluatorOutput['results'],
): Promise<AITestQuestion[]> {
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

export async function generateTest(
  lessonSlug: string,
  keyPoints: string[],
  text: string,
): Promise<AITest> {
  const questionCount = keyPoints.length * 2;
  const mcqCount = Math.round(questionCount * 0.7);
  const freeTextCount = questionCount - mcqCount;

  // Step 1: Generate initial questions using Sonnet
  let questions = await generate(
    keyPoints,
    text,
    questionCount,
    mcqCount,
    freeTextCount,
  );

  // Step 2-3: Evaluate with Haiku, optimize failures with Sonnet (max 2 retries)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const evaluation = await evaluate(keyPoints, text, questions);
    // The model judges quality; length is measured, so a correct option that
    // is visibly the longest is caught even when the evaluator lets it pass.
    const results = withLengthGiveaways(evaluation.results, questions);

    const hasFailed = results.some((r) => !r.pass);
    if (!hasFailed) break;

    const failedIds = new Set(
      results.filter((r) => !r.pass).map((r) => r.questionId),
    );
    const failedQuestions = questions.filter((q) => failedIds.has(q.id));
    const passedQuestions = questions.filter((q) => !failedIds.has(q.id));
    const failedFeedback = results.filter((r) => !r.pass);

    const regenerated = await optimize(
      keyPoints,
      text,
      failedQuestions,
      failedFeedback,
    );
    questions = [...passedQuestions, ...regenerated];
  }

  // Last, so regenerated questions are placed too: the model's own ordering
  // (correct answer mostly B) never reaches the learner.
  return { lessonSlug, questions: balanceAnswerPositions(questions) };
}
