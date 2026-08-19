import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import type { LessonMaterial } from '#/db/lesson';
import { queryKeys } from '#/hooks/data/keys';
import type { LessonMaterialResponse } from '#/lib/lesson-gating';
import { readOutOfTierError } from '#/lib/out-of-tier-material-error';

export const lessonMaterialAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<LessonMaterialResponse<NonNullable<LessonMaterial>>>(() => ({
    queryKey: queryKeys.lessonMaterial(lessonSlug),
    queryFn: async () => {
      const response = await fetch(
        `/api/lesson/material?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!response.ok) {
        // A 403 out-of-tier (never completed, outside the pilot's current
        // level) is a distinct outcome from every other failure here — it
        // means "not yours", not "try again" — so it gets its own error class
        // the wrapper can redirect on instead of rendering a retry card.
        const outOfTier = await readOutOfTierError(response);
        if (outOfTier) throw outOfTier;
        throw new Error('Failed to fetch lesson material');
      }
      return (await response.json()) as LessonMaterialResponse<
        NonNullable<LessonMaterial>
      >;
    },
    enabled: !!lessonSlug,
    staleTime: (query) =>
      // A stale LOCKED response is harmful — the student clears the gate and
      // the tabs stay shut for the rest of the hour. A stale UNLOCKED response
      // cannot go stale in a harmful direction.
      query.state.data?.locked ? 0 : 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  })),
);
