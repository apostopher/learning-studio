import { generateObject } from "ai";
import { sonnet, haiku } from "./ai-provider";
import { generationPrompt } from "./prompts/generation";
import { evaluatorPrompt } from "./prompts/evaluator";
import { optimizerPrompt } from "./prompts/optimizer";
import {
  AITestGenerationOutputSchema,
  EvaluatorOutputSchema,
  type AITest,
  type AITestQuestion,
  type EvaluatorOutput,
} from "./schemas";

const MAX_RETRIES = 2;

async function generate(
  keyPoints: string[],
  text: string,
  questionCount: number,
  mcqCount: number,
  freeTextCount: number,
): Promise<AITestQuestion[]> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AITestGenerationOutputSchema,
    prompt: generationPrompt({ keyPoints, text, questionCount, mcqCount, freeTextCount }),
  });
  return object.questions;
}

async function evaluate(
  keyPoints: string[],
  text: string,
  questions: AITestQuestion[],
): Promise<EvaluatorOutput> {
  const { object } = await generateObject({
    model: haiku,
    schema: EvaluatorOutputSchema,
    prompt: evaluatorPrompt({ keyPoints, text, questions }),
  });
  return object;
}

async function optimize(
  keyPoints: string[],
  text: string,
  failedQuestions: AITestQuestion[],
  evaluatorFeedback: EvaluatorOutput["results"],
): Promise<AITestQuestion[]> {
  const { object } = await generateObject({
    model: sonnet,
    schema: AITestGenerationOutputSchema,
    prompt: optimizerPrompt({ keyPoints, text, failedQuestions, evaluatorFeedback }),
  });
  return object.questions;
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
  let questions = await generate(keyPoints, text, questionCount, mcqCount, freeTextCount);

  // Step 2-3: Evaluate with Haiku, optimize failures with Sonnet (max 2 retries)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const evaluation = await evaluate(keyPoints, text, questions);

    const hasFailed = evaluation.results.some((r) => !r.pass);
    if (!hasFailed) break;

    const failedIds = new Set(
      evaluation.results.filter((r) => !r.pass).map((r) => r.questionId),
    );
    const failedQuestions = questions.filter((q) => failedIds.has(q.id));
    const passedQuestions = questions.filter((q) => !failedIds.has(q.id));
    const failedFeedback = evaluation.results.filter((r) => !r.pass);

    const regenerated = await optimize(keyPoints, text, failedQuestions, failedFeedback);
    questions = [...passedQuestions, ...regenerated];
  }

  return { lessonSlug, questions };
}
