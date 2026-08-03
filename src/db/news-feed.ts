import { and, asc, desc, eq, gte, notInArray } from 'drizzle-orm';
import { db } from '#/db';
import {
  newsArticlesTable,
  newsSourcesTable,
  userNewsSourcesTable,
} from '#/db/schema';
import type { FeedRow } from '#/lib/news-feed-shaping';
import type { NewsSourceChoice } from '#/lib/news-schemas';

/**
 * Backstop, not a page size. The feed is bounded by construction at roughly
 * `sources × 3 × 7`; this only trips if that assumption breaks, and it warns
 * when it does rather than truncating silently.
 */
export const FEED_ROW_LIMIT = 300;

/** Ids of the sources this student has muted, within one course. */
export async function getMutedSourceIds(args: {
  userId: string;
  courseId: number;
}): Promise<number[]> {
  const rows = await db
    .select({ id: userNewsSourcesTable.newsSourceId })
    .from(userNewsSourcesTable)
    .innerJoin(
      newsSourcesTable,
      eq(newsSourcesTable.id, userNewsSourcesTable.newsSourceId),
    )
    .where(
      and(
        eq(userNewsSourcesTable.userId, args.userId),
        eq(newsSourcesTable.courseId, args.courseId),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Every source in the course, with this student's mute state.
 *
 * Includes INACTIVE sources deliberately — a student who muted a source the
 * admin later hid should still see it as muted rather than have it silently
 * vanish from their picker and reappear unmuted if the admin re-enables it.
 */
export async function listCourseSourceChoices(args: {
  courseId: number;
  mutedIds: readonly number[];
}): Promise<NewsSourceChoice[]> {
  const muted = new Set(args.mutedIds);
  const rows = await db
    .select({
      id: newsSourcesTable.id,
      name: newsSourcesTable.name,
      imageUrlAvif: newsSourcesTable.imageUrlAvif,
      imageUrlWebp: newsSourcesTable.imageUrlWebp,
      imageUrl: newsSourcesTable.imageUrl,
      tintColor: newsSourcesTable.tintColor,
    })
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.courseId, args.courseId))
    .orderBy(asc(newsSourcesTable.rank), asc(newsSourcesTable.id));
  return rows.map((row) => ({ ...row, muted: muted.has(row.id) }));
}

/**
 * Visible article rows for one course, joined to their source.
 *
 * Filters here are the ones a row can be excluded by outright. Duplicate
 * collapsing is NOT one of them — it happens in `shapeNewsFeed`, over the rows
 * that survive, because which copy of a story to show depends on what these
 * filters removed.
 */
export async function listVisibleFeedRows(args: {
  courseId: number;
  since: Date;
  mutedSourceIds: readonly number[];
}): Promise<FeedRow[]> {
  const conditions = [
    eq(newsArticlesTable.courseId, args.courseId),
    // The reader applies its own window rather than trusting the cron's sweep
    // to have run — a dead cron must not resurrect month-old news.
    gte(newsArticlesTable.firstSeenAt, args.since),
    // Without this, flipping a source to Hidden in admin leaves up to a week
    // of its stories on the student page.
    eq(newsSourcesTable.active, true),
  ];
  if (args.mutedSourceIds.length > 0) {
    conditions.push(
      notInArray(newsArticlesTable.newsSourceId, [...args.mutedSourceIds]),
    );
  }

  const rows = await db
    .select({
      id: newsArticlesTable.id,
      title: newsArticlesTable.title,
      description: newsArticlesTable.description,
      canonicalUrl: newsArticlesTable.canonicalUrl,
      imageUrl: newsArticlesTable.imageUrl,
      publishedAt: newsArticlesTable.publishedAt,
      publishedAtEstimated: newsArticlesTable.publishedAtEstimated,
      firstSeenAt: newsArticlesTable.firstSeenAt,
      dedupeOfId: newsArticlesTable.dedupeOfId,
      sourceId: newsSourcesTable.id,
      sourceName: newsSourcesTable.name,
      sourceImageUrlAvif: newsSourcesTable.imageUrlAvif,
      sourceImageUrlWebp: newsSourcesTable.imageUrlWebp,
      sourceImageUrl: newsSourcesTable.imageUrl,
      sourceTintColor: newsSourcesTable.tintColor,
      sourceRank: newsSourcesTable.rank,
    })
    .from(newsArticlesTable)
    .innerJoin(
      newsSourcesTable,
      eq(newsSourcesTable.id, newsArticlesTable.newsSourceId),
    )
    .where(and(...conditions))
    .orderBy(desc(newsArticlesTable.publishedAt), asc(newsArticlesTable.id))
    .limit(FEED_ROW_LIMIT);

  if (rows.length === FEED_ROW_LIMIT) {
    console.warn(
      `[news-feed] course ${args.courseId} hit the ${FEED_ROW_LIMIT}-row cap; older articles were dropped from this response`,
    );
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    canonicalUrl: row.canonicalUrl,
    imageUrl: row.imageUrl,
    // NOT NULL in practice: the cron always writes `publishedAt ?? firstSeenAt`.
    // Falling back keeps a hand-inserted row from producing an invalid date.
    publishedAt: row.publishedAt ?? row.firstSeenAt,
    publishedAtEstimated: row.publishedAtEstimated,
    firstSeenAt: row.firstSeenAt,
    dedupeOfId: row.dedupeOfId,
    source: {
      id: row.sourceId,
      name: row.sourceName,
      imageUrlAvif: row.sourceImageUrlAvif,
      imageUrlWebp: row.sourceImageUrlWebp,
      imageUrl: row.sourceImageUrl,
      tintColor: row.sourceTintColor,
    },
    sourceRank: Number(row.sourceRank),
  }));
}

/**
 * The course a source belongs to, or null when there is no such source.
 *
 * The caller turns both "no such source" and "not your course" into one 404,
 * so a student cannot probe for another course's source ids.
 */
export async function getSourceCourseId(
  sourceId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: newsSourcesTable.courseId })
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.id, sourceId));
  return row?.courseId ?? null;
}

/**
 * Add or remove one exclusion row. Idempotent in both directions: the unique
 * index absorbs a repeat mute, and an unmute that matches nothing is a
 * success, so a double-tap never 500s.
 */
export async function setSourceMuted(args: {
  userId: string;
  sourceId: number;
  muted: boolean;
}): Promise<void> {
  if (args.muted) {
    await db
      .insert(userNewsSourcesTable)
      .values({ userId: args.userId, newsSourceId: args.sourceId })
      .onConflictDoNothing();
    return;
  }
  await db
    .delete(userNewsSourcesTable)
    .where(
      and(
        eq(userNewsSourcesTable.userId, args.userId),
        eq(userNewsSourcesTable.newsSourceId, args.sourceId),
      ),
    );
}
