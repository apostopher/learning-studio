import { and, cosineDistance, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '#/db';
import { newsArticlesTable, newsSourcesTable } from '#/db/schema';
import type { SimilarityCandidate } from '#/lib/news/select-articles';
import type { NewsScrapeStatus } from '#/types';

/** How long an article stays before the cron sweeps it. Also the dedup window. */
export const RETENTION_DAYS = 7;

export interface UpsertArticleInput {
  courseId: number;
  newsSourceId: number;
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  publishedAtEstimated: boolean;
  embedding: number[] | null;
  dedupeOfId: number | null;
}

/**
 * Insert an article, or refresh it if this course already has that canonical
 * URL.
 *
 * The upsert is what makes the run idempotent: a retried cron, or two
 * invocations overlapping, cannot produce two rows for one story.
 * `firstSeenAt` is deliberately NOT updated on conflict — it is the retention
 * clock, and refreshing it would make a permanently-linked article immortal.
 */
export async function upsertArticle(
  input: UpsertArticleInput,
): Promise<{ id: number }> {
  const [row] = await db
    .insert(newsArticlesTable)
    .values({
      courseId: input.courseId,
      newsSourceId: input.newsSourceId,
      canonicalUrl: input.canonicalUrl,
      originalUrl: input.originalUrl,
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      publishedAt: input.publishedAt,
      publishedAtEstimated: input.publishedAtEstimated,
      embedding: input.embedding,
      dedupeOfId: input.dedupeOfId,
    })
    .onConflictDoUpdate({
      target: [newsArticlesTable.courseId, newsArticlesTable.canonicalUrl],
      set: {
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        publishedAt: input.publishedAt,
        publishedAtEstimated: input.publishedAtEstimated,
        embedding: input.embedding,
      },
    })
    .returning({ id: newsArticlesTable.id });
  return row;
}

/**
 * Nearest stories to `embedding` within one course, best match first.
 *
 * Scoped to the retention window because anything older is already gone, and
 * restricted to originals (`dedupe_of_id is null`) so a duplicate never
 * becomes the anchor another duplicate points at — chains would make
 * "also covered by" unresolvable in one hop.
 */
export async function findSimilarArticles(args: {
  courseId: number;
  embedding: number[];
  since: Date;
  limit?: number;
}): Promise<SimilarityCandidate[]> {
  const similarity = sql<number>`1 - (${cosineDistance(newsArticlesTable.embedding, args.embedding)})`;
  const rows = await db
    .select({ id: newsArticlesTable.id, similarity })
    .from(newsArticlesTable)
    .where(
      and(
        eq(newsArticlesTable.courseId, args.courseId),
        gte(newsArticlesTable.firstSeenAt, args.since),
        sql`${newsArticlesTable.dedupeOfId} is null`,
        sql`${newsArticlesTable.embedding} is not null`,
      ),
    )
    .orderBy(desc(similarity))
    .limit(args.limit ?? 5);
  return rows.map((row) => ({
    id: row.id,
    similarity: Number(row.similarity),
  }));
}

/** Sources due for scraping, stalest first. Never-scraped sources sort first. */
export async function listScrapeTargets(): Promise<
  Array<{
    id: number;
    courseId: number;
    url: string;
    selectors: string[] | null;
    rank: number;
    lastScrapedAt: Date | null;
  }>
> {
  const rows = await db
    .select({
      id: newsSourcesTable.id,
      courseId: newsSourcesTable.courseId,
      url: newsSourcesTable.url,
      selectors: newsSourcesTable.selectors,
      rank: newsSourcesTable.rank,
      lastScrapedAt: newsSourcesTable.lastScrapedAt,
    })
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.active, true))
    // NULLS FIRST is the default for ASC in Postgres, which is what we want:
    // a source that has never run is maximally stale.
    .orderBy(
      sql`${newsSourcesTable.lastScrapedAt} asc nulls first`,
      // Within equal staleness, the admin's own ordering decides who goes
      // first — so if the budget runs out, the sources they ranked highest
      // are the ones that made it.
      sql`${newsSourcesTable.rank} asc`,
    );
  return rows.map((row) => ({ ...row, rank: Number(row.rank) }));
}

export async function recordScrapeOutcome(args: {
  sourceId: number;
  status: NewsScrapeStatus;
  message: string | null;
  at: Date;
}): Promise<void> {
  await db
    .update(newsSourcesTable)
    .set({
      lastScrapedAt: args.at,
      lastScrapeStatus: args.status,
      lastScrapeMessage: args.message,
    })
    .where(eq(newsSourcesTable.id, args.sourceId));
}

/**
 * Drop articles past the retention window.
 *
 * Keyed on `firstSeenAt`, never `publishedAt`: it is the only timestamp
 * guaranteed present and monotonic. On `publishedAt` an undated article would
 * be immortal and one emitting `1970-01-01` would be deleted on arrival.
 */
export async function deleteExpiredArticles(
  before: Date,
): Promise<{ deleted: number }> {
  const rows = await db
    .delete(newsArticlesTable)
    .where(lt(newsArticlesTable.firstSeenAt, before))
    .returning({ id: newsArticlesTable.id });
  return { deleted: rows.length };
}
