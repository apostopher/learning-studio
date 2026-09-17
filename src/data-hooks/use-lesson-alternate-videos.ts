import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { type OtherVideoIds, OtherVideoIdsSchema } from '#/types';
import { dataKeys } from './keys';

/**
 * The translated videos attached to a lesson, per language. Guarded
 * server-side like the primary ref; `enabled` false when the lesson has no
 * primary video — an alternate without a primary has nothing to be an
 * alternate to, and the tab does not show the section.
 */
export function useLessonAlternateVideos(lessonId: number, enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.lessonAlternateVideos(lessonId),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<OtherVideoIds> => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/alternate-videos`,
      );
      if (!res.ok) throw new Error(`Failed to load languages (${res.status})`);
      return OtherVideoIdsSchema.parse(await res.json());
    },
  });
}
