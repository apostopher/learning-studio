import { useAtomValue } from 'jotai';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import type { WatchWindow } from '#/db/videos-progress';
import { queryKeys } from './keys';

/**
 * Wire format of /api/course/progress. Server serialises Sets as arrays
 * (see src/routes/api/course/progress.ts), so the client-side type uses
 * `number[]` for progressByVideo values rather than `Set<number>`.
 */
export type ClientCourseProgress = {
  progressByVideo: Record<string, number[]>;
  watchHistory: Record<string, WatchWindow[]>;
};

export const courseProgressAtomFamily = atomFamily((slug: string) =>
  atomWithQuery(() => ({
    queryKey: queryKeys.courseProgress(slug),
    queryFn: async () => {
      const response = await fetch(`/api/course/progress?slug=${slug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch course progress');
      }
      const data = await response.json();
      return data as ClientCourseProgress;
    },
    enabled: !!slug,
  })),
);

export function useCourseProgress(slug?: string) {
  return useAtomValue(courseProgressAtomFamily(slug ?? ''));
}
