import type { NewsArticle, NewsFeedSource } from './news-schemas';

/**
 * Pure feed shaping: collapse duplicate coverage into one article per story,
 * pick which copy to show, and order the result.
 *
 * No database, network or React dependency — the server imports it to build
 * the response and the tests import it directly, matching `library-gating.ts`
 * and `lesson-gating.ts`.
 */

/** One visible article row joined to its source. Rows are ALREADY filtered. */
export interface FeedRow {
  id: number;
  title: string;
  description: string | null;
  canonicalUrl: string;
  imageUrl: string | null;
  publishedAt: Date;
  publishedAtEstimated: boolean;
  firstSeenAt: Date;
  /** Null when this row is an original; else the article it duplicates. */
  dedupeOfId: number | null;
  source: NewsFeedSource;
  /** The source's rank within the course. Lower wins a tie. */
  sourceRank: number;
}

/**
 * The story a row belongs to.
 *
 * `dedupe_of_id` points at the winning article, so every member of a cluster
 * — including the winner, whose own id it is — maps to the same key. The
 * pointed-at row may itself be gone (expired, or its source deactivated); the
 * key still groups the survivors, which is what makes the promotion below
 * work at all.
 */
const clusterKey = (row: FeedRow): number => row.dedupeOfId ?? row.id;

/**
 * Which of two visible copies of a story to show.
 *
 * Source rank first — that is the admin's own statement of which publication
 * they trust. Then the earlier-published copy, then the lower id, so the
 * choice is stable across requests rather than varying with row order.
 */
function preferred(a: FeedRow, b: FeedRow): FeedRow {
  if (a.sourceRank !== b.sourceRank) return a.sourceRank < b.sourceRank ? a : b;
  const timeDelta = a.publishedAt.getTime() - b.publishedAt.getTime();
  if (timeDelta !== 0) return timeDelta < 0 ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * Collapse rows into one article per story, newest first.
 *
 * The winner is chosen from the rows that SURVIVED filtering, not from the row
 * the cron originally picked. That distinction is the whole point: with a flat
 * "originals only" filter, muting one source silently deletes another
 * source's coverage of the same story, and the student has no way to know it
 * existed. Here a story disappears only when every source that ran it is gone.
 */
export function shapeNewsFeed(rows: readonly FeedRow[]): NewsArticle[] {
  const clusters = new Map<number, FeedRow[]>();
  for (const row of rows) {
    const key = clusterKey(row);
    const existing = clusters.get(key);
    if (existing) existing.push(row);
    else clusters.set(key, [row]);
  }

  const articles: Array<{ article: NewsArticle; winner: FeedRow }> = [];
  for (const members of clusters.values()) {
    const winner = members.reduce(preferred);

    // Deduplicated by source id: one publication running two URLs for the same
    // story would otherwise be listed twice as its own co-coverer.
    const others = new Map<number, string>();
    for (const member of members) {
      if (member.source.id === winner.source.id) continue;
      others.set(member.source.id, member.source.name);
    }

    articles.push({
      winner,
      article: {
        id: winner.id,
        title: winner.title,
        description: winner.description,
        url: winner.canonicalUrl,
        imageUrl: winner.imageUrl,
        publishedAt: winner.publishedAt,
        publishedAtEstimated: winner.publishedAtEstimated,
        source: winner.source,
        alsoCoveredBy: [...others.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.id - b.id),
      },
    });
  }

  return articles
    .sort((a, b) => {
      const timeDelta =
        b.winner.publishedAt.getTime() - a.winner.publishedAt.getTime();
      if (timeDelta !== 0) return timeDelta;
      if (a.winner.sourceRank !== b.winner.sourceRank) {
        return a.winner.sourceRank - b.winner.sourceRank;
      }
      return a.winner.id - b.winner.id;
    })
    .map((entry) => entry.article);
}

/**
 * Most recent `firstSeenAt` across the rows, or null when there are none.
 *
 * Computed over the rows rather than the shaped articles on purpose: a
 * duplicate that lost its cluster still proves the scraper ran, and freshness
 * is a statement about the pipeline, not about what survived filtering.
 */
export function latestFirstSeenAt(rows: readonly FeedRow[]): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (latest === null || row.firstSeenAt.getTime() > latest.getTime()) {
      latest = row.firstSeenAt;
    }
  }
  return latest;
}
