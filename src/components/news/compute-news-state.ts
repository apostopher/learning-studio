import type {
  NewsArticle,
  NewsFeedResponse,
  NewsSourceChoice,
} from '#/lib/news-schemas';

/**
 * Why the feed is empty. Four outcomes that all look like `articles.length
 * === 0` but call for completely different responses: an admin has work to do,
 * the reader should wait, the reader did this to themselves, or the reader is
 * not enrolled.
 */
export type NewsEmptyReason =
  /** The course has no sources at all — nothing the student can act on. */
  | 'no-sources'
  /** Sources exist but the cron has not produced anything for them yet. */
  | 'no-articles'
  /** Every source is muted. The one empty state the student can fix. */
  | 'all-muted';

export type NewsPageState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'empty';
      reason: NewsEmptyReason;
      sources: readonly NewsSourceChoice[];
      mutedCount: number;
    }
  | {
      kind: 'stories';
      /** The dominant story. Always present in this branch. */
      lead: NewsArticle;
      /** The secondary hero. Absent when the feed holds exactly one story. */
      second: NewsArticle | null;
      /** Everything after the two heroes; may be empty. */
      rest: readonly NewsArticle[];
      sources: readonly NewsSourceChoice[];
      visibleSourceCount: number;
      mutedCount: number;
      lastUpdatedAt: Date | null;
    };

/**
 * Map one query's state onto what the page renders.
 *
 * Pure, so the branches that are awkward to reach with real data — a single
 * article, an all-muted feed, a course with no sources — are testable without
 * a QueryClient or a database.
 */
export function computeNewsState({
  isLoading,
  isError,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  data: NewsFeedResponse | undefined;
}): NewsPageState {
  // Error is checked against data presence, not before loading: a background
  // refetch that fails leaves isError true while good data is still cached,
  // and blanking a populated page for that would be worse than showing
  // slightly stale news.
  if (isError && !data) return { kind: 'error' };
  if (isLoading || !data) return { kind: 'loading' };

  const mutedCount = data.sources.filter((source) => source.muted).length;

  if (data.articles.length === 0) {
    return {
      kind: 'empty',
      reason: emptyReason(data.sources, mutedCount),
      sources: data.sources,
      mutedCount,
    };
  }

  const [lead, second, ...rest] = data.articles;
  return {
    kind: 'stories',
    lead,
    second: second ?? null,
    rest,
    sources: data.sources,
    visibleSourceCount: data.sources.length - mutedCount,
    mutedCount,
    lastUpdatedAt: data.lastUpdatedAt,
  };
}

function emptyReason(
  sources: readonly NewsSourceChoice[],
  mutedCount: number,
): NewsEmptyReason {
  // Checked before `no-sources` would be, but only reachable when sources
  // exist: an empty list cannot be "all muted", and reporting it that way
  // would offer the student an unmute button that does nothing.
  if (sources.length > 0 && mutedCount === sources.length) return 'all-muted';
  if (sources.length === 0) return 'no-sources';
  return 'no-articles';
}
