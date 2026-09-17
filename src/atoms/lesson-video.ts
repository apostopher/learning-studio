import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { videoLanguageAtom } from '#/atoms/video-language';
import { queryKeys } from '#/hooks/data/keys';
import {
  type LearnerPlayback,
  learnerPlaybackSchema,
  playbackErrorSchema,
} from '#/lib/admin-schemas';
import { type LessonRef, sameLessonRef } from '#/lib/lesson-ref';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';
import { PlaybackError } from '#/lib/video-providers/errors';

/**
 * `opts.fresh` maps to the playback route's `fresh=1` query flag, which
 * skips the server's Redis cache READ (still authorized by the same
 * session+gate checks — see `routes/api/lesson/playback.ts`). Factored out
 * from the atom below so `refetchLessonPlaybackFresh` can reuse it with a
 * different `fresh` value against the SAME query cache entry, and exported
 * (rather than just module-private) so tests can exercise this exact fetch —
 * the one `lessonPlaybackAtomFamily`'s default `queryFn` actually calls —
 * instead of asserting against a hand-rolled duplicate that could drift from
 * it silently.
 *
 * Both slugs go on the wire: the route refuses a request without
 * `courseSlug`, and with it gates the lesson inside that course and signs the
 * URL with that course's credentials.
 */
export const fetchLessonPlayback = async (
  { courseSlug, lessonSlug }: LessonRef,
  opts?: { fresh?: boolean; lang?: VideoLang },
): Promise<LearnerPlayback> => {
  const params = new URLSearchParams({
    lessonSlug,
    courseSlug,
    lang: opts?.lang ?? PRIMARY_VIDEO_LANG,
  });
  if (opts?.fresh) params.set('fresh', '1');
  const r = await fetch(`/api/lesson/playback?${params.toString()}`);
  if (!r.ok) {
    // A coded body means the server knows exactly what went wrong. Throwing a
    // generic Error here discarded that, so a course with no provider
    // credentials showed the learner "Failed to fetch playback" and a Retry
    // that could never succeed.
    const coded = playbackErrorSchema.safeParse(
      await r.json().catch(() => null),
    );
    if (coded.success) {
      throw new PlaybackError(coded.data.code, coded.data.error);
    }
    throw new Error('Failed to fetch playback');
  }
  return learnerPlaybackSchema.parse(await r.json());
};

/**
 * Keyed by lesson ONLY. The language is read inside `getOptions`, not put in
 * the family key, and that is load-bearing: `keepPreviousData` only carries
 * data across a key change on ONE `QueryObserver`. A family keyed by
 * language would hand back a different atom — a fresh observer with no
 * previous data — on every switch, so `data` would go undefined, the player
 * would unmount, and the playhead restore point would die with it.
 * `jotai-tanstack-query` re-runs `getOptions` when `videoLanguageAtom`
 * changes and calls `setOptions` on the same cached observer, which is
 * exactly the one-observer key change `keepPreviousData` needs.
 */
export const lessonPlaybackAtomFamily = atomFamily(
  (lesson: LessonRef) =>
    atomWithQuery<LearnerPlayback>((get) => {
      const lang = get(videoLanguageAtom);
      return {
        queryKey: queryKeys.lessonPlayback(lesson, lang),
        queryFn: () => fetchLessonPlayback(lesson, { lang }),
        enabled: !!lesson.lessonSlug && !!lesson.courseSlug,
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60,
        retry: 1,
        // A language switch changes the key. Keeping the previous language's
        // data during the fetch keeps the player mounted (and the playhead
        // capture in VideoPlayerContainer meaningful) instead of dropping to
        // the loading skeleton and back.
        placeholderData: keepPreviousData,
      };
    }),
  sameLessonRef,
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
  lesson: LessonRef,
  lang: VideoLang = PRIMARY_VIDEO_LANG,
) =>
  queryClient.fetchQuery({
    queryKey: queryKeys.lessonPlayback(lesson, lang),
    queryFn: () => fetchLessonPlayback(lesson, { fresh: true, lang }),
    // No internal retry: the caller (`compute-recovery-action.ts`'s
    // `MAX_RECOVERY_ATTEMPTS`) already owns a small, deliberate retry
    // budget for this exact failure. TanStack Query's own default retry
    // (3, with backoff) would silently multiply that budget underneath it.
    retry: false,
  });
