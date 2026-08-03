import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type NewsFeedResponse,
  NewsFeedResponseSchema,
  type SetNewsSourceMutedInput,
} from '#/lib/news-schemas';
import { dataKeys } from './keys';

/**
 * A course's news feed for the signed-in learner.
 *
 * `staleTime` of 5 minutes rather than the library's 0: nothing consequential
 * is gated on freshness here, and the underlying data only changes when the
 * cron runs once a day. Refetching on every mount would cost a request per
 * navigation to show identical bytes.
 */
export function useCourseNews(courseSlug: string) {
  return useQuery<NewsFeedResponse>({
    queryKey: dataKeys.courseNews(courseSlug),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/course/news?courseSlug=${encodeURIComponent(courseSlug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load news (${res.status})`);
      }
      return NewsFeedResponseSchema.parse(await res.json());
    },
  });
}

/**
 * Mute or unmute one source for this learner.
 *
 * Optimistic, because a toggle that only settles after a round trip reads as
 * broken — and the feed itself changes underneath it, so the whole cached
 * response is rewritten locally: the toggled source flips, and any article
 * from it disappears immediately.
 *
 * Note the rollback restores the ENTIRE previous response, not just the
 * toggle. Muting removes articles, and a failed write that restored only the
 * flag would leave the feed missing stories the student can still see listed.
 */
export function useSetNewsSourceMuted(courseSlug: string) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseNews(courseSlug);

  return useMutation({
    mutationFn: async (input: SetNewsSourceMutedInput) => {
      const res = await fetch('/api/course/news/mute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`Failed to update source (${res.status})`);
      }
      return (await res.json()) as { sourceId: number; muted: boolean };
    },
    onMutate: async ({ sourceId, muted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NewsFeedResponse>(key);
      if (previous) {
        queryClient.setQueryData<NewsFeedResponse>(key, {
          ...previous,
          sources: previous.sources.map((source) =>
            source.id === sourceId ? { ...source, muted } : source,
          ),
          // Only muting can be predicted locally. UNmuting may resurface
          // stories the server never sent — including a promoted duplicate
          // whose winner is this source — so it waits for the refetch.
          articles: muted
            ? previous.articles.filter(
                (article) => article.source.id !== sourceId,
              )
            : previous.articles,
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
