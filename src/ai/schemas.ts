import { z } from 'zod';

// Option for MCQ
export const AITestOptionSchema = z.object({
  id: z.string(),
  value: z.string(),
});

// MCQ question
export const AITestMCQQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('mcq'),
  question: z.string().describe('Question text in markdown'),
  options: z.array(AITestOptionSchema).length(4),
  correctOptionId: z.string(),
  keyPointIndex: z.number().int().min(0),
});

// Free-text question
export const AITestFreeTextQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('free-text'),
  question: z.string().describe('Question text in markdown'),
  expectedAnswer: z.string().describe('Reference answer for AI grading'),
  keyPointIndex: z.number().int().min(0),
});

// Discriminated union
export const AITestQuestionSchema = z.discriminatedUnion('type', [
  AITestMCQQuestionSchema,
  AITestFreeTextQuestionSchema,
]);

// Generation output (what the AI returns)
export const AITestGenerationOutputSchema = z.object({
  questions: z.array(AITestQuestionSchema),
});

// Full test with lesson slug
export const AITestSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestQuestionSchema),
});

// Quality check per question
export const QuestionQualitySchema = z.object({
  questionId: z.string(),
  pass: z.boolean(),
  reason: z
    .string()
    .describe('Why this question passed or failed quality check'),
});

// Evaluator output
export const EvaluatorOutputSchema = z.object({
  results: z.array(QuestionQualitySchema),
  allPassed: z.boolean(),
});

// Free-text eval AI output
//
// Judgements, not a score: the grader decides what the answer MEANS, idea by
// idea, and `scoreFreeTextEval` turns that into a number. Asking a model for a
// holistic 0–100 against a reference answer anchors it on the reference's
// wording, so correct answers phrased differently lost marks.
export const AIFreeTextEvalOutputSchema = z.object({
  essentialIdeas: z
    .array(
      z.object({
        idea: z
          .string()
          .describe('One idea a correct answer must convey, in plain words'),
        conveyed: z
          .enum(['fully', 'partly', 'not'])
          .describe(
            "Whether the student's answer conveys this idea, in any wording",
          ),
      }),
    )
    .min(1)
    .max(5),
  incorrectClaims: z
    .array(z.string())
    .describe(
      "Statements in the student's answer that are factually wrong or unsafe according to the lesson. Empty if none.",
    ),
  explanation: z.string(),
});

// Evaluation result per answer
export const AIEvaluationResultSchema = z.object({
  questionId: z.string(),
  type: z.enum(['mcq', 'free-text']),
  score: z.number().int().min(0).max(100),
  userAnswer: z.string(),
  explanation: z.string(),
});

// Full test result
export const AITestResultSchema = z.object({
  lessonSlug: z.string(),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});

// Inferred types
export type AITestOption = z.infer<typeof AITestOptionSchema>;
export type AITestMCQQuestion = z.infer<typeof AITestMCQQuestionSchema>;
export type AITestFreeTextQuestion = z.infer<
  typeof AITestFreeTextQuestionSchema
>;
export type AITestQuestion = z.infer<typeof AITestQuestionSchema>;
export type AITestGenerationOutput = z.infer<
  typeof AITestGenerationOutputSchema
>;
export type AITest = z.infer<typeof AITestSchema>;
export type QuestionQuality = z.infer<typeof QuestionQualitySchema>;
export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;
export type AIFreeTextEvalOutput = z.infer<typeof AIFreeTextEvalOutputSchema>;
export type AIEvaluationResult = z.infer<typeof AIEvaluationResultSchema>;
export type AITestResult = z.infer<typeof AITestResultSchema>;
