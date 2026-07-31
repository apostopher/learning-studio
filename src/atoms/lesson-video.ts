import type { QueryClient } from '@tanstack/react-query';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { queryKeys } from '#/hooks/data/keys';
import { lessonPlaybackSchema } from '#/lib/admin-schemas';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

/**
 * `opts.fresh` maps to the playback route's `fresh=1` query flag, which
 * skips the server's Redis cache READ (still authorized by the same
 * session+gate checks — see `routes/api/lesson/playback.ts`). Exported
 * separately from the atom below so `refetchLessonPlaybackFresh` can reuse
 * it with a different `fresh` value against the SAME query cache entry.
 */
const fetchLessonPlayback = async (
  lessonSlug: string,
  opts?: { fresh?: boolean },
): Promise<PlaybackResult> => {
  const params = new URLSearchParams({ lessonSlug });
  if (opts?.fresh) params.set('fresh', '1');
  const r = await fetch(`/api/lesson/playback?${params.toString()}`);
  if (!r.ok) throw new Error('Failed to fetch playback');
  return lessonPlaybackSchema.parse(await r.json());
};

export const lessonPlaybackAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<PlaybackResult>(() => ({
    queryKey: queryKeys.lessonPlayback(lessonSlug),
    queryFn: () => fetchLessonPlayback(lessonSlug),
    enabled: !!lessonSlug,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  })),
);

/**
 * Re-resolves this lesson's playback bypassing the server's cache read, and
 * writes the result into the SAME TanStack Query cache entry
 * `lessonPlaybackAtomFamily` reads (`queryClient.fetchQuery` targets a
 * queryKey directly, independent of which `useQuery`/`atomWithQuery`
 * instance normally owns it) — so `useLessonVideo` picks up the fresh value
 * without a remount.
 *
 * Exists because a bare `queryClient.invalidateQueries` re-runs the DEFAULT
 * `queryFn` above, which hits the exact same server route without `fresh=1`
 * — and that route serves a Redis-cached body. A caller invalidating after
 * observing a real failure (a mid-playback 401/403, or a plain retry click)
 * would just get the SAME already-rejected URL back. Use this instead of
 * `invalidateQueries` any time the caller has evidence the cached value is
 * bad, not merely stale.
 */
export const refetchLessonPlaybackFresh = (
  queryClient: QueryClient,
  lessonSlug: string,
) =>
  queryClient.fetchQuery({
    queryKey: queryKeys.lessonPlayback(lessonSlug),
    queryFn: () => fetchLessonPlayback(lessonSlug, { fresh: true }),
    // No internal retry: the caller (`compute-recovery-action.ts`'s
    // `MAX_RECOVERY_ATTEMPTS`) already owns a small, deliberate retry
    // budget for this exact failure. TanStack Query's own default retry
    // (3, with backoff) would silently multiply that budget underneath it.
    retry: false,
  });
