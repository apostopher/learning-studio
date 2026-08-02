import { useQuery } from '@tanstack/react-query';
import {
  type LibraryResponse,
  LibraryResponseSchema,
} from '#/lib/library-schemas';
import { dataKeys } from './keys';

/**
 * A course's library files for the signed-in learner, each with its lock.
 *
 * Always fresh on mount (D18). Locks are a pure function of progress that
 * changes on OTHER pages — a learner who just finished a video and walks here
 * to collect the file must not be told it is still locked, and nothing on the
 * page would tell them to refresh. Same reasoning, and the same settings, as
 * `useOnboardingStatus`: a decision this consequential is not served from a
 * cache filled before the thing that changed it happened.
 */
export function useLibrary(courseSlug: string) {
  return useQuery<LibraryResponse>({
    queryKey: dataKeys.library(courseSlug),
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await fetch(
        `/api/course/library?courseSlug=${encodeURIComponent(courseSlug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load library (${res.status})`);
      }
      return LibraryResponseSchema.parse(await res.json());
    },
  });
}
