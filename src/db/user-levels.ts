import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#/db';
import { type DBUserLevel, userLevelsTable } from '#/db/schema';
import type { LevelSource, UserLevel } from '#/types';

export type InsertLevelRow = {
  userId: string;
  courseId: number;
  level: UserLevel;
  source: LevelSource;
  message?: string | null;
  note?: string | null;
  changedBy?: string | null;
};

/**
 * The pilot's level in one course — the newest row.
 *
 * Falls back to 'basic' rather than throwing. `ensureEnrolmentLevel` means an
 * enrolled pilot always has a row, so the fallback only fires for a course
 * they are not enrolled in, where 'basic' is the harmless answer.
 */
export async function getCurrentLevel(
  userId: string,
  courseId: number,
): Promise<UserLevel> {
  const [row] = await db
    .select({ level: userLevelsTable.level })
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id))
    .limit(1);
  return row?.level ?? 'basic';
}

/**
 * Every course this pilot has a level row in, keyed by course id.
 *
 * One query rather than N: `getMyCourses` needs a level per card to decide
 * where each card links, and a per-course round trip there would be one query
 * per subscribed course on the /app critical path. DISTINCT ON for the same
 * reason `listUsersWithLevels` uses it — "newest row per (user, course)" is a
 * ranking, not something a drizzle join expresses cleanly.
 *
 * A course absent from the map has no rows at all; callers should read that as
 * 'basic', matching `getCurrentLevel`'s fallback.
 */
export async function getCurrentLevelsByCourse(
  userId: string,
): Promise<Map<number, UserLevel>> {
  const rows = await db.execute<{ course_id: number; level: UserLevel }>(sql`
    SELECT DISTINCT ON (course_id) course_id, level
    FROM user_levels
    WHERE user_id = ${userId}
    ORDER BY course_id, created_at DESC, id DESC
  `);
  return new Map(rows.rows.map((row) => [row.course_id, row.level]));
}

/** Full history for one (user, course), newest first. */
export async function listLevelHistory(
  userId: string,
  courseId: number,
): Promise<DBUserLevel[]> {
  return db
    .select()
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id));
}

/**
 * Append a row. Never updates — a correction is a newer row.
 *
 * Returns the new row's id so a caller that needs to acknowledge it later
 * (e.g. `maybePromote`, whose id lets an in-flow dismissal acknowledge the
 * same row the between-visits banner would otherwise announce again) doesn't
 * have to re-query for it.
 */
export async function insertLevelRow(input: InsertLevelRow): Promise<number> {
  const [row] = await db
    .insert(userLevelsTable)
    .values({
      userId: input.userId,
      courseId: input.courseId,
      level: input.level,
      source: input.source,
      message: input.message ?? null,
      note: input.note ?? null,
      changedBy: input.changedBy ?? null,
    })
    .returning({ id: userLevelsTable.id });
  return row.id;
}

/**
 * Write the starting Basic row, once.
 *
 * Conditional on there being no rows at all — not on the absence of an
 * 'enrolment' row — so that unenrolling and re-enrolling an Advanced pilot
 * does not walk them back to Basic.
 */
export async function ensureEnrolmentLevel(
  userId: string,
  courseId: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO user_levels (user_id, course_id, level, source)
    SELECT ${userId}, ${courseId}, 'basic', 'enrolment'
    WHERE NOT EXISTS (
      SELECT 1 FROM user_levels
      WHERE user_id = ${userId} AND course_id = ${courseId}
    )
  `);
}

/**
 * The newest row, if it was written by an admin OR earned by the pilot and
 * they have not yet dismissed it. Drives the between-visits notice.
 *
 * Renamed from `getUnacknowledgedAdminChange`: an earned promotion needed the
 * same mechanism for a reason specific to how it is earned. Three of the four
 * progress-write routes (section tap, quiz submit, debrief save) answer with
 * a readable body the in-flow `PromotionInterstitial` reads directly, but
 * `report-video-progress.ts` fires over `navigator.sendBeacon`, which has no
 * readable response in the normal (non-unload) case — a promotion earned on a
 * video milestone is otherwise invisible to the client. Surfacing it here
 * means it is announced on the pilot's next load regardless of which write
 * earned it, using the acknowledgedAt machinery this function already had.
 * `'enrolment'` rows are excluded on purpose — the idempotent starting row is
 * not a change to announce.
 */
export async function getUnacknowledgedLevelChange(
  userId: string,
  courseId: number,
): Promise<DBUserLevel | null> {
  const [row] = await db
    .select()
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id))
    .limit(1);
  if (!row) return null;
  if (row.source !== 'admin' && row.source !== 'earned') return null;
  if (row.acknowledgedAt !== null) return null;
  return row;
}

/** Stamp a row as seen. Scoped by userId so one pilot cannot dismiss another's. */
export async function acknowledgeLevelRow(
  userId: string,
  rowId: number,
): Promise<void> {
  await db
    .update(userLevelsTable)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(userLevelsTable.id, rowId),
        eq(userLevelsTable.userId, userId),
        isNull(userLevelsTable.acknowledgedAt),
      ),
    );
}
