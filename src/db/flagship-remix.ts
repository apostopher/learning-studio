import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { remixCourse } from '#/db/course-remixes';
import { courseOrgsTable, coursesTable } from '#/db/schema';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

/**
 * The flagship is ALWAYS remixed into every other course in its org: new
 * courses get it on creation (`createCourse` → `remixFlagshipIntoNewCourse`)
 * and existing ones are back-filled by `scripts/remix-flagship-everywhere.ts`.
 * The remix machinery itself (`#/db/course-remixes`) is unchanged — this
 * module only decides WHEN it runs.
 */

/** The org's flagship course id, or null when no course in it carries the slug. */
export async function findFlagshipCourseId(
  orgId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .innerJoin(courseOrgsTable, eq(courseOrgsTable.courseId, coursesTable.id))
    .where(
      and(
        eq(coursesTable.slug, FLAGSHIP_COURSE_SLUG),
        eq(courseOrgsTable.orgId, orgId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Which of an org's courses the backfill should remix the flagship into:
 * all of them except the flagship itself and those already linked to it.
 * Pure, so the backfill's idempotence is testable without a database.
 */
export function coursesNeedingFlagshipRemix(input: {
  orgCourseIds: readonly number[];
  flagshipId: number;
  alreadyRemixedIds: readonly number[];
}): { toRemix: number[]; alreadyRemixed: number[] } {
  const linked = new Set(input.alreadyRemixedIds);
  const candidates = input.orgCourseIds.filter((id) => id !== input.flagshipId);
  return {
    toRemix: candidates.filter((id) => !linked.has(id)),
    alreadyRemixed: candidates.filter((id) => linked.has(id)),
  };
}

/**
 * Remix the org's flagship into a course that was just created. The course
 * is empty, so the flagship's modules land first.
 *
 * Never throws: by the time this runs the course exists and is linked to the
 * org, and failing the create over a missing remix would leave the admin
 * with a course they were told was not created. A refusal or an error is
 * logged; the backfill script repairs any course left unlinked.
 */
export async function remixFlagshipIntoNewCourse(
  courseId: number,
  orgId: number,
): Promise<void> {
  try {
    const flagshipId = await findFlagshipCourseId(orgId);
    if (flagshipId === null || flagshipId === courseId) return;
    const result = await remixCourse({
      orgId,
      courseId,
      sourceCourseId: flagshipId,
      actorId: null,
    });
    if (!result.ok) {
      // The one refusal with a remedy to name: which flagship modules gate
      // on a module the flagship only borrows.
      const detail =
        result.reason === 'source-depends-on-borrowed'
          ? ` (${result.modules.map((m) => m.slug).join(', ')})`
          : '';
      console.error(
        `createCourse: could not remix flagship ${flagshipId} into course ${courseId}: ${result.reason}${detail}`,
      );
    }
  } catch (error) {
    console.error(
      `createCourse: remixing the flagship into course ${courseId} failed`,
      error,
    );
  }
}
