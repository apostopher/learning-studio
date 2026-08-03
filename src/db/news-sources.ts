import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import { newsSourcesTable } from '#/db/schema';
import type {
  CreateNewsSourceInput,
  NewsSource,
  UpdateNewsSourceInput,
} from '#/lib/admin-schemas';

/**
 * News sources are sandboxed per course (see `newsSourcesTable`). Every
 * function here takes `courseId` and constrains on it, so a request carrying
 * another course's source id touches nothing rather than editing across the
 * boundary.
 */

const columns = {
  id: newsSourcesTable.id,
  courseId: newsSourcesTable.courseId,
  name: newsSourcesTable.name,
  url: newsSourcesTable.url,
  imageUrlAvif: newsSourcesTable.imageUrlAvif,
  imageUrlWebp: newsSourcesTable.imageUrlWebp,
  // Read but never written here: the admin form has no field for it, and an
  // update that set it from absent input would wipe every migrated logo.
  imageUrl: newsSourcesTable.imageUrl,
  tintColor: newsSourcesTable.tintColor,
  active: newsSourcesTable.active,
  rank: newsSourcesTable.rank,
};

type Row = {
  id: number;
  courseId: number;
  name: string;
  url: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
  imageUrl: string | null;
  tintColor: string | null;
  active: boolean;
  rank: string;
};

const toNewsSource = (row: Row): NewsSource => ({
  ...row,
  rank: Number(row.rank),
});

/**
 * Write outcomes the caller must branch on. A duplicate URL is an expected
 * result of a valid request, not an exception — the route turns it into a
 * field-level error on the URL input rather than a 500.
 */
export type NewsSourceWriteResult =
  | { ok: true; source: NewsSource }
  | { ok: false; reason: 'duplicate_url' }
  | { ok: false; reason: 'not_found' };

/** Postgres unique-violation. The composite index is the only one on this table. */
const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(
    cause &&
      typeof cause === 'object' &&
      (cause as { code?: unknown }).code === '23505',
  );
};

/** A course's news sources in feed order. */
export async function listCourseNewsSources(
  courseId: number,
): Promise<NewsSource[]> {
  const rows = await db
    .select(columns)
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.courseId, courseId))
    .orderBy(asc(newsSourcesTable.rank), asc(newsSourcesTable.id));
  return rows.map(toNewsSource);
}

export async function createNewsSource(
  courseId: number,
  input: CreateNewsSourceInput,
): Promise<NewsSourceWriteResult> {
  // Append: max + 1 within this course, matching createModule/createLesson.
  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${newsSourcesTable.rank})` })
    .from(newsSourcesTable)
    .where(eq(newsSourcesTable.courseId, courseId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  try {
    const [created] = await db
      .insert(newsSourcesTable)
      .values({
        courseId,
        name: input.name,
        url: input.url,
        imageUrlAvif: input.imageUrlAvif ?? null,
        imageUrlWebp: input.imageUrlWebp ?? null,
        tintColor: input.tintColor ?? null,
        rank: String(rank),
      })
      .returning(columns);
    return { ok: true, source: toNewsSource(created) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'duplicate_url' };
    throw error;
  }
}

export async function updateNewsSource(
  courseId: number,
  sourceId: number,
  input: UpdateNewsSourceInput,
): Promise<NewsSourceWriteResult> {
  try {
    const [updated] = await db
      .update(newsSourcesTable)
      .set({
        name: input.name,
        url: input.url,
        imageUrlAvif: input.imageUrlAvif ?? null,
        imageUrlWebp: input.imageUrlWebp ?? null,
        tintColor: input.tintColor ?? null,
        ...(input.active === undefined ? {} : { active: input.active }),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(newsSourcesTable.id, sourceId),
          eq(newsSourcesTable.courseId, courseId),
        ),
      )
      .returning(columns);
    if (!updated) return { ok: false, reason: 'not_found' };
    return { ok: true, source: toNewsSource(updated) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'duplicate_url' };
    throw error;
  }
}

/** Permanent. Safe by construction: nothing outside this course references the row. */
export async function deleteNewsSource(
  courseId: number,
  sourceId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(newsSourcesTable)
    .where(
      and(
        eq(newsSourcesTable.id, sourceId),
        eq(newsSourcesTable.courseId, courseId),
      ),
    )
    .returning({ id: newsSourcesTable.id });
  return deleted.length > 0;
}

/**
 * Midpoint reorder, matching `reorderModule`.
 *
 * Neighbours are verified to belong to this course BEFORE the write. Without
 * that check a neighbour id from another course makes the rank subquery return
 * NULL, and since `rank` is NOT NULL the update dies as an unhandled 500
 * instead of a clean rejection.
 *
 * The midpoint itself stays in SQL so it is computed in Postgres `numeric`
 * arithmetic. Round-tripping through a JS number would cap the split depth at
 * double precision and give back the exhaustion problem that widening the
 * column to scale 15 was meant to remove.
 */
export async function reorderNewsSource(input: {
  courseId: number;
  sourceId: number;
  prevSourceId: number | null;
  nextSourceId: number | null;
}): Promise<{ id: number; rank: number } | null> {
  const required = [input.prevSourceId, input.nextSourceId].filter(
    (id): id is number => id !== null,
  );
  if (required.length === 0) return null;

  const present = await db
    .select({ id: newsSourcesTable.id })
    .from(newsSourcesTable)
    .where(
      and(
        eq(newsSourcesTable.courseId, input.courseId),
        inArray(newsSourcesTable.id, required),
      ),
    );
  if (present.length !== required.length) return null;

  const neighborRank = (id: number) =>
    sql`(select ${newsSourcesTable.rank} from ${newsSourcesTable} where ${newsSourcesTable.id} = ${id})`;

  const prevRank = input.prevSourceId ? neighborRank(input.prevSourceId) : null;
  const nextRank = input.nextSourceId ? neighborRank(input.nextSourceId) : null;

  let rankExpr: SQL;
  if (prevRank && nextRank) rankExpr = sql`(${prevRank} + ${nextRank}) / 2`;
  else if (nextRank) rankExpr = sql`${nextRank} / 2`;
  else if (prevRank) rankExpr = sql`${prevRank} + 1`;
  else return null;

  const [updated] = await db
    .update(newsSourcesTable)
    .set({ rank: rankExpr, updatedAt: sql`now()` })
    .where(
      and(
        eq(newsSourcesTable.id, input.sourceId),
        eq(newsSourcesTable.courseId, input.courseId),
      ),
    )
    .returning({ id: newsSourcesTable.id, rank: newsSourcesTable.rank });

  if (!updated) return null;
  return { id: updated.id, rank: Number(updated.rank) };
}
