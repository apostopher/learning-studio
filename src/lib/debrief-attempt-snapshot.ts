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
  /**
   * Question ids by set, in the order asked (`splitIntoSets`). Absent on
   * attempts started before sets (2026-11-18): those count as one set of
   * every question (`attemptSets`).
   */
  sets: z.array(z.array(z.string())).optional(),
  /** The pilot took up the offer of set 2 after passing set 1. */
  improveAccepted: z.boolean().optional(),
  /**
   * Each completed set's verdict, frozen when the set completed (index 0 =
   * set 1). The offer and the sets reached read these, never a re-judge on
   * today's video and quiz facts: a quiz retaken mid-attempt must not take
   * away an offer already made, nor shut a set 2 already opened. Absent on
   * attempts from before (2026-11-20): their sets are judged live.
   */
  setVerdicts: z.array(z.boolean()).optional(),
});
export type StoredAttempt = z.infer<typeof StoredAttemptSchema>;

/** The attempt's sets; one set of every question on a pre-sets attempt. */
export function attemptSets(stored: {
  questions: readonly { id: string }[];
  sets?: string[][];
}): string[][] {
  return stored.sets ?? [stored.questions.map((q) => q.id)];
}
