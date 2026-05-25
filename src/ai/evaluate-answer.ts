import { generateObject } from "ai";
import { sonnet } from "./ai-provider";
import { evaluationPrompt } from "./prompts/evaluation";
import {
  AIFreeTextEvalOutputSchema,
  type AIEvaluationResult,
  type AITestMCQQuestion,
  type AITestFreeTextQuestion,
} from "./schemas";

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
    type: "mcq",
    score: isCorrect ? 100 : 0,
    userAnswer,
    explanation: `The correct answer is: ${correctOption?.value ?? question.correctOptionId}`,
  };
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
    type: "free-text",
    score: object.score,
    userAnswer,
    explanation: object.explanation,
  };
}
