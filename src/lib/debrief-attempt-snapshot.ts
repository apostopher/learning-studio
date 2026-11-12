import { z } from 'zod';
import { AITestGenerationQuestionSchema } from '#/ai/schemas';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';

/**
 * The ONE debrief format tag. It is:
 * - `lesson_test_results.format` of a chunk-based, server-graded attempt
 *   (legacy client-graded rows have null);
 * - the literal in the one-open-attempt partial index (schema.ts and
 *   migrate-knowledge-chunks.ts render it from here);
 * - part of every prepared test's fingerprint, so a bump retires them all.
 */
export const DEBRIEF_ATTEMPT_FORMAT = 'knowledge-chunks-v1';

const KnowledgeChunkSchema: z.ZodType<KnowledgeChunk> = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
});

/**
 * What a chunk-format attempt stores in `questions`: the questions with their
 * expected answers and chunk tags, AND the chunks and context they were
 * written from. Grading reads only this, never the lesson's current source or
 * chunks: those may have changed or gone since the attempt started (only the
 * current chunk version is kept), and an open attempt must stay answerable.
 *
 * `lessonSlug` + `questions` keep the legacy `AITest` shape, so readers of
 * old rows (`AITestSchema`) still parse new ones.
 */
export const StoredAttemptSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestGenerationQuestionSchema),
  chunks: z.array(KnowledgeChunkSchema),
  context: z.string(),
});
export type StoredAttempt = z.infer<typeof StoredAttemptSchema>;
