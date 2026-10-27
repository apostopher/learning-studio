import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { AIEvaluationResultSchema, AITestQuestionSchema } from '#/ai/schemas';
import { TRACKED_LESSON_SECTIONS } from '#/lib/lesson-visit-section';
import { dataKeys } from './keys';

const outstandingItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video') }),
  z.object({ kind: z.literal('quiz') }),
  z.object({ kind: z.literal('visit') }),
  z.object({
    kind: z.literal('section'),
    section: z.enum(TRACKED_LESSON_SECTIONS),
  }),
]);

const debriefStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not-done') }),
  z.object({ kind: z.literal('waiting'), availableAt: z.string() }),
  z.object({ kind: z.literal('open'), retake: z.boolean() }),
  z.object({ kind: z.literal('retake-waiting'), availableAt: z.string() }),
  z.object({ kind: z.literal('passed') }),
]);

export const debriefStatusSchema = z.object({
  state: debriefStateSchema,
  lessonOutstanding: z.array(outstandingItemSchema),
  attempts: z
    .array(
      z.object({
        id: z.number(),
        totalScore: z.number(),
        completedAt: z.string(),
        passed: z.boolean(),
        questions: z.array(AITestQuestionSchema),
        evaluations: z.array(AIEvaluationResultSchema),
      }),
    )
    .optional(),
});

export type DebriefStatus = z.infer<typeof debriefStatusSchema>;

export async function fetchDebriefStatus({
  courseSlug,
  lessonSlug,
}: {
  courseSlug: string;
  lessonSlug: string;
}): Promise<DebriefStatus> {
  const res = await fetch(
    `/api/lesson/debrief-status?lessonSlug=${encodeURIComponent(lessonSlug)}&courseSlug=${encodeURIComponent(courseSlug)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load debrief status (${res.status})`);
  }
  return debriefStatusSchema.parse(await res.json());
}

/**
 * Which state this pilot's debrief is in, and (once passed) their attempts.
 * Backed by GET /api/lesson/debrief-status. A finished attempt invalidates it
 * (see `useSaveResults`), so a minute of staleness only covers the clock
 * running out on a waiting state.
 */
export function useDebriefStatus({
  courseSlug,
  lessonSlug,
  enabled,
}: {
  courseSlug: string;
  lessonSlug: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: dataKeys.debriefStatus(courseSlug, lessonSlug),
    queryFn: () => fetchDebriefStatus({ courseSlug, lessonSlug }),
    enabled: enabled && courseSlug.length > 0 && lessonSlug.length > 0,
    staleTime: 60_000,
  });
}
