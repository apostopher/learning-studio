import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  coursesTable,
  offeringsTable,
  offeringUsersTable,
  userProfileTable,
} from '#/db/schema';
import type {
  CreateOfferingInput,
  Offering,
  OfferingUser,
  UpdateOfferingInput,
} from '#/lib/offering-schemas';
import type { UserLevel } from '#/types';

/**
 * Data access for offerings — dated runs of a course.
 *
 * A course has many offerings: the same course run in spring and again in
 * autumn is two rows here and one row in `courses`. Nothing in this module
 * assumes otherwise, and the calendar draws each row independently.
 */

/**
 * The roster for a set of offerings, grouped by offering id.
 *
 * `courseByOffering` is needed because a person's level is PER COURSE: the
 * same student can be advanced on one course and basic on another, so the
 * level shown against them here is the one for the course this offering runs.
 */
async function loadUsersByOffering(
  courseByOffering: Map<number, number>,
): Promise<Map<number, OfferingUser[]>> {
  const byOffering = new Map<number, OfferingUser[]>();
  const offeringIds = [...courseByOffering.keys()];
  // `inArray` with an empty list is a SQL error in postgres, and there is
  // nothing to ask for anyway.
  if (offeringIds.length === 0) return byOffering;

  const [rows, levelRows] = await Promise.all([
    db
      .select({
        offeringId: offeringUsersTable.offeringId,
        userId: offeringUsersTable.userId,
        firstName: userProfileTable.firstName,
        lastName: userProfileTable.lastName,
        email: userProfileTable.email,
      })
      .from(offeringUsersTable)
      .innerJoin(
        userProfileTable,
        eq(userProfileTable.userId, offeringUsersTable.userId),
      )
      .where(inArray(offeringUsersTable.offeringId, offeringIds))
      .orderBy(userProfileTable.lastName, userProfileTable.email),

    // `user_levels` is append-only history, so the current level is the NEWEST
    // row per (user, course) — a ranking rather than a filter, which is why
    // this is DISTINCT ON in raw SQL. Same shape as `listAdminUsers`.
    db.execute<{ user_id: string; course_id: number; level: UserLevel }>(sql`
      SELECT DISTINCT ON (user_id, course_id) user_id, course_id, level
      FROM user_levels
      ORDER BY user_id, course_id, created_at DESC, id DESC
    `),
  ]);

  const levelByUserCourse = new Map<string, UserLevel>();
  for (const row of levelRows.rows) {
    levelByUserCourse.set(`${row.user_id}:${row.course_id}`, row.level);
  }

  for (const row of rows) {
    const courseId = courseByOffering.get(row.offeringId);
    const list = byOffering.get(row.offeringId) ?? [];
    list.push({
      userId: row.userId,
      name: personName(row),
      email: row.email,
      level: levelByUserCourse.get(`${row.userId}:${courseId}`) ?? null,
    });
    byOffering.set(row.offeringId, list);
  }
  return byOffering;
}

/**
 * The name column: the person's name, or their email when they have none.
 *
 * Not `personLabel`, which appends the email in parentheses for a one-line
 * picker. The roster table has its own email column, so repeating it inside
 * the name would print every address twice on the same row.
 */
function personName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name || person.email;
}

/**
 * Offerings overlapping a date window, newest-starting last.
 *
 * The overlap test is `startsOn <= windowEnd AND endsOn >= windowStart`, not
 * `startsOn` inside the window: an offering that began before the window and
 * is still running has to be drawn on it, and filtering on the start date
 * alone would drop exactly the runs currently under way — the ones a schedule
 * screen most needs to show.
 *
 * `courseIds` narrows to an actor's staffed courses. Undefined means no
 * narrowing (the caller holds `course:read`); an EMPTY array is a caller with
 * no courses at all, and returns nothing rather than everything.
 */
export async function listOfferings({
  windowStart,
  windowEnd,
  courseIds,
}: {
  windowStart: string;
  windowEnd: string;
  courseIds?: number[];
}): Promise<Offering[]> {
  if (courseIds?.length === 0) return [];

  const rows = await db
    .select({
      id: offeringsTable.id,
      courseId: offeringsTable.courseId,
      courseName: coursesTable.name,
      startsOn: offeringsTable.startsOn,
      endsOn: offeringsTable.endsOn,
    })
    .from(offeringsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(
      and(
        lte(offeringsTable.startsOn, windowEnd),
        gte(offeringsTable.endsOn, windowStart),
        courseIds ? inArray(offeringsTable.courseId, courseIds) : undefined,
      ),
    )
    .orderBy(offeringsTable.startsOn, offeringsTable.id);

  const users = await loadUsersByOffering(
    new Map(rows.map((row) => [row.id, row.courseId])),
  );
  return rows.map((row) => ({ ...row, users: users.get(row.id) ?? [] }));
}

/** One offering by id, or null. Used to answer a write with the fresh row. */
export async function getOffering(id: number): Promise<Offering | null> {
  const [row] = await db
    .select({
      id: offeringsTable.id,
      courseId: offeringsTable.courseId,
      courseName: coursesTable.name,
      startsOn: offeringsTable.startsOn,
      endsOn: offeringsTable.endsOn,
    })
    .from(offeringsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(eq(offeringsTable.id, id))
    .limit(1);
  if (!row) return null;

  const users = await loadUsersByOffering(new Map([[row.id, row.courseId]]));
  return { ...row, users: users.get(row.id) ?? [] };
}

/**
 * Replace an offering's roster.
 *
 * Delete-then-insert rather than a diff: the roster is small, the whole set
 * arrives on every write, and a diff would have to reason about which of two
 * concurrent edits won. Inside the caller's transaction so a failed insert
 * cannot leave the offering with nobody on it.
 */
async function replaceRoster(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  offeringId: number,
  userIds: string[],
  actorId: string | null,
): Promise<void> {
  await tx
    .delete(offeringUsersTable)
    .where(eq(offeringUsersTable.offeringId, offeringId));
  if (userIds.length === 0) return;

  // De-duplicated here as well as by the unique index: the index would make
  // the whole insert fail, and a picker that somehow offered the same person
  // twice should not lose the entire roster over it.
  const unique = [...new Set(userIds)];
  await tx.insert(offeringUsersTable).values(
    unique.map((userId) => ({
      offeringId,
      userId,
      assignedBy: actorId,
    })),
  );
}

/** Schedule a course. Returns the created offering, roster included. */
export async function createOffering(
  input: CreateOfferingInput,
  actorId: string | null,
): Promise<Offering> {
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(offeringsTable)
      .values({
        courseId: input.courseId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        createdBy: actorId,
      })
      .returning({ id: offeringsTable.id });
    await replaceRoster(tx, created.id, input.userIds, actorId);
    return created.id;
  });

  const offering = await getOffering(id);
  // Unreachable in practice — the row was just committed — but the type says
  // it can be null and inventing a placeholder would be worse than throwing.
  if (!offering) throw new Error('Offering vanished after creation');
  return offering;
}

/** Change an offering's dates and roster. Returns null if it is gone. */
export async function updateOffering(
  id: number,
  input: UpdateOfferingInput,
  actorId: string | null,
): Promise<Offering | null> {
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(offeringsTable)
      .set({
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        updatedAt: new Date(),
      })
      .where(eq(offeringsTable.id, id))
      .returning({ id: offeringsTable.id });
    if (!row) return false;
    await replaceRoster(tx, id, input.userIds, actorId);
    return true;
  });

  return updated ? await getOffering(id) : null;
}

/** Unschedule. The roster goes with it, by cascade. */
export async function deleteOffering(id: number): Promise<boolean> {
  const rows = await db
    .delete(offeringsTable)
    .where(eq(offeringsTable.id, id))
    .returning({ id: offeringsTable.id });
  return rows.length > 0;
}
