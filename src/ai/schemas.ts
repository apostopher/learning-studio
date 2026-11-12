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
  /**
   * The knowledge chunks this question tests. `chunkIds[0]` is the focus
   * chunk the question was written for; an optional second is a chunk it also
   * leans on. Opaque ids from the lesson's stored chunks.
   */
  chunkIds: z.array(z.string()).min(1).max(2),
  /** Legacy: attempts saved before chunk tagging carry a key-point index. */
  keyPointIndex: z.number().int().min(0).optional(),
});

// Discriminated union
export const AITestQuestionSchema = z.discriminatedUnion('type', [
  AITestMCQQuestionSchema,
  AITestFreeTextQuestionSchema,
]);

// Generation output (what the AI returns). Written questions only: debriefs
// stopped asking MCQ on 2026-11-11. MCQ stays in `AITestQuestionSchema` so
// attempts saved before then still parse and render.
export const AITestGenerationOutputSchema = z.object({
  questions: z.array(AITestFreeTextQuestionSchema),
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
// Judgements, not a score: the grader decides what the answer MEANS, chunk by
// chunk, and `scoreChunkJudgement` turns that into a number. Asking a model
// for a holistic 0–100 against a reference answer anchors it on the
// reference's wording, so correct answers phrased differently lost marks.
export const ChunkJudgementSchema = z.object({
  chunkId: z.string(),
  conveyed: z
    .enum(['fully', 'partly', 'not'])
    .describe(
      "Whether the student's answer conveys this chunk, in any wording",
    ),
  note: z.string().describe('One short sentence on what was or was not said'),
});

// Legacy per-idea judgement, kept so attempts saved before chunks still parse.
const EssentialIdeaSchema = z.object({
  idea: z.string(),
  conveyed: z.enum(['fully', 'partly', 'not']),
});

export const AIFreeTextEvalOutputSchema = z.object({
  chunkJudgements: z.array(ChunkJudgementSchema).min(1).max(2),
  incorrectClaims: z
    .array(z.string())
    .describe(
      "Statements of fact in the student's answer that the lesson contradicts, or that are unsafe. Never analogies, comparisons, opinions or off-topic reasoning. Empty if none.",
    ),
  revisitNote: z
    .string()
    .describe(
      'Empty when every judged chunk is fully conveyed; otherwise 1–3 sentences, second person, about what this answer said.',
    ),
});

// Evaluation result per answer
export const AIEvaluationResultSchema = z.object({
  questionId: z.string(),
  type: z.enum(['mcq', 'free-text']),
  score: z.number().int().min(0).max(100),
  userAnswer: z.string(),
  explanation: z.string(),
  /**
   * Free-text only: the grader's judgements the score was computed from
   * (`scoreChunkJudgement`), kept so a disputed score can be explained after
   * the fact. Optional — MCQ has none, and attempts saved before 2026-11-09
   * stored only the score.
   */
  chunkScores: z.record(z.string(), z.number()).optional(),
  revisitNote: z.string().optional(),
  /** Legacy (pre-chunk attempts): per-idea judgements. */
  essentialIdeas: z.array(EssentialIdeaSchema).optional(),
  incorrectClaims: z.array(z.string()).optional(),
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
export type ChunkJudgement = z.infer<typeof ChunkJudgementSchema>;
export type AIFreeTextEvalOutput = z.infer<typeof AIFreeTextEvalOutputSchema>;
export type AIEvaluationResult = z.infer<typeof AIEvaluationResultSchema>;
export type AITestResult = z.infer<typeof AITestResultSchema>;
