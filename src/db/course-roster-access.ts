import { and, eq, ne } from 'drizzle-orm';
import { db } from '#/db';
import { coursesTable, offeringsTable, offeringUsersTable } from '#/db/schema';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';
import type { SeatPlan } from '#/types';

/**
 * Who may take a course: the people on any of its offerings, whatever the
 * offering's dates (user, 2026-11-27). The schedule decides, for students and
 * staff alike; `course_subscriptions` (enrolment) no longer grants a course.
 * Staff still reach the courses they author through their own bypasses
 * (`getSubscribedCourseSlugs`, `viewingAsAuthor`).
 *
 * This is the one definition: /app's list, the course route's guard and every
 * per-request access check read it, so they cannot disagree.
 *
 * Never the 3D Airmanship course (user, 2026-11-27): it is not a course a
 * pilot takes, only the library remixed into every other course. An old
 * offering of it grants nothing; its modules reach pilots inside the courses
 * that borrow them.
 */
const notFlagship = () => ne(coursesTable.slug, FLAGSHIP_COURSE_SLUG);

/** Ids of the courses the user is on an offering of, as a subquery. */
export function rosteredCourseIds(userId: string) {
  return db
    .selectDistinct({ courseId: offeringsTable.courseId })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(and(eq(offeringUsersTable.userId, userId), notFlagship()));
}

/** Whether the user is on any offering of this course. */
export async function isOnCourseRoster(
  userId: string,
  courseId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: offeringUsersTable.id })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(
      and(
        eq(offeringUsersTable.userId, userId),
        eq(offeringsTable.courseId, courseId),
        notFlagship(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Whether the user is on any offering of the course with this slug. */
export async function isOnCourseRosterBySlug(
  userId: string,
  courseSlug: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: offeringUsersTable.id })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(
      and(
        eq(offeringUsersTable.userId, userId),
        eq(coursesTable.slug, courseSlug),
        notFlagship(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Slugs of the courses the user is on an offering of. */
export async function getRosteredCourseSlugs(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: coursesTable.slug })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(and(eq(offeringUsersTable.userId, userId), notFlagship()));
  return rows.map((r) => r.slug);
}

/** The windows of every offering of this course the user is on. */
export async function getMyOfferingWindows(
  userId: string,
  courseSlug: string,
): Promise<{ startsOn: string; endsOn: string }[]> {
  return db
    .select({
      startsOn: offeringsTable.startsOn,
      endsOn: offeringsTable.endsOn,
    })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, offeringsTable.courseId))
    .where(
      and(
        eq(offeringUsersTable.userId, userId),
        eq(coursesTable.slug, courseSlug),
        notFlagship(),
      ),
    );
}

/**
 * The user's plan on this course: `paid` when ANY of their seats on its
 * offerings is paid, `free` when every one is free, null when they hold none.
 *
 * Any paid seat wins: someone moved from a free run to a paid one keeps the
 * free seat on the old offering, and must not be held to it.
 */
export async function seatPlanForCourse(
  userId: string,
  courseId: number,
): Promise<SeatPlan | null> {
  const rows = await db
    .selectDistinct({ plan: offeringUsersTable.plan })
    .from(offeringUsersTable)
    .innerJoin(
      offeringsTable,
      eq(offeringsTable.id, offeringUsersTable.offeringId),
    )
    .where(
      and(
        eq(offeringUsersTable.userId, userId),
        eq(offeringsTable.courseId, courseId),
      ),
    );
  if (rows.length === 0) return null;
  return rows.some((row) => row.plan === 'paid') ? 'paid' : 'free';
}
