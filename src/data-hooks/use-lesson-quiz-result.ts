import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { z } from 'zod';
import { extractPromotion, pendingPromotionAtom } from '#/atoms/promotion';
import {
  type CourseLessonQuizAnswers,
  CourseLessonQuizAnswersSchema,
} from '#/types';
import { dataKeys } from './keys';

/**
 * One recorded attempt. `createdAt` arrives as an ISO string — it is a `Date`
 * in the row and `Response.json` serialises it.
 */
export const lessonQuizResultSchema = z
  .object({
    id: z.number(),
    lessonSlug: z.string(),
    answers: CourseLessonQuizAnswersSchema,
    createdAt: z.string(),
  })
  .nullable();

export type LessonQuizResult = z.infer<typeof lessonQuizResultSchema>;

/**
 * The student's latest attempt at this lesson's authored quiz, or null if they
 * have never taken it. Backed by GET /api/lesson/quiz/result.
 *
 * Consumers must gate on `isFetched`, not just `isLoading`: rendering question
 * one while this is still in flight lets a student answer, and then replaces
 * their screen with an attempt from last week — discarding the tap with no
 * explanation, or starting a second attempt they never asked for.
 */
export function useLessonQuizResult(lessonSlug: string) {
  return useQuery({
    queryKey: dataKeys.lessonQuizResult(lessonSlug),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/lesson/quiz/result?lessonSlug=${encodeURIComponent(lessonSlug)}`,
        { signal },
      );
      if (!res.ok) {
        throw new Error(`Failed to load quiz result (${res.status})`);
      }
      return lessonQuizResultSchema.parse(await res.json());
    },
    enabled: lessonSlug.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Record a completed attempt.
 *
 * On success the saved row is written straight into the result cache, so the
 * tab reads as completed without a refetch. Deliberately no `invalidateQueries`
 * — the response is the row, and a refetch would only re-fetch what we already
 * hold.
 *
 * The route returns `{ ...row, promotion }`. `lessonQuizResultSchema` doesn't
 * declare `promotion`, so `.parse` on the raw response would silently strip
 * it (zod's default `object()` mode drops unrecognised keys) — `promotion` is
 * read from the same raw json separately via `extractPromotion` so it never
 * gets dropped on the floor.
 */
export function useSubmitLessonQuiz(lessonSlug: string) {
  const queryClient = useQueryClient();
  const setPromotion = useSetAtom(pendingPromotionAtom);

  return useMutation({
    mutationFn: async (answers: CourseLessonQuizAnswers) => {
      const res = await fetch('/api/lesson/quiz/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonSlug, answers }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save quiz answers (${res.status})`);
      }
      const json = await res.json();
      return {
        row: lessonQuizResultSchema.parse(json),
        promotion: extractPromotion(json),
      };
    },
    onSuccess: ({ row, promotion }) => {
      queryClient.setQueryData(dataKeys.lessonQuizResult(lessonSlug), row);
      if (promotion) setPromotion(promotion);
    },
  });
}
