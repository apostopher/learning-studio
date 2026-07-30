import { useQuery } from '@tanstack/react-query';
import { lessonPlaybackSchema, playbackErrorSchema } from '#/lib/admin-schemas';
import { PlaybackError } from '#/lib/video-providers/errors';
import { dataKeys } from './keys';

/** Mint the next URL this far before the current one dies. */
const REFETCH_MARGIN_SECONDS = 60;
/** Floor on the polling rate, so an already-expired URL cannot busy-loop. */
const MIN_REFETCH_SECONDS = 30;

/**
 * How long to wait before re-resolving playback, from the current URL's TTL.
 *
 * Signed playback URLs expire (1h for Mux), and `staleTime` alone will not
 * refetch a query that stays mounted — so without this an admin preview left
 * open past the TTL silently stops working. `false` disables polling when the
 * provider gives no expiry.
 *
 * Exported for testing: the hook itself cannot be rendered under this repo's
 * vitest setup, so the arithmetic is verified directly.
 */
export function playbackRefetchDelayMs(
  expiresInSeconds: number | null | undefined,
): number | false {
  if (expiresInSeconds == null) return false;
  return (
    Math.max(MIN_REFETCH_SECONDS, expiresInSeconds - REFETCH_MARGIN_SECONDS) *
    1000
  );
}

/** Resolved playback URL for a lesson's video. `null` when no video is set. */
export function useLessonVideoPlayback(lessonId: number, enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.lessonPlayback(lessonId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/video-playback`);
      if (res.status === 404) return null;
      if (!res.ok) {
        // A coded body means the provider refused something specific — rethrow
        // it as a PlaybackError so the UI can tell "your key is dead" from
        // "this video is broken" instead of showing one generic failure.
        const parsed = playbackErrorSchema.safeParse(
          await res.json().catch(() => null),
        );
        if (parsed.success) {
          throw new PlaybackError(parsed.data.code, parsed.data.error);
        }
        throw new Error(`Failed to load playback (${res.status})`);
      }
      return lessonPlaybackSchema.parse(await res.json());
    },
    enabled,
    staleTime: 5 * 60_000,
    // Keeps a mounted preview's signed URL alive; see playbackRefetchDelayMs.
    refetchInterval: (query) =>
      playbackRefetchDelayMs(query.state.data?.expiresInSeconds),
    // A refused credential is not worth retrying — nothing changes until the
    // admin enters a new key, and each retry delays the prompt telling them to.
    retry: (failureCount, error) =>
      error instanceof PlaybackError && error.code === 'PROVIDER_AUTH_REJECTED'
        ? false
        : failureCount < 1,
  });
}
