/**
 * Remix the flagship course (`FLAGSHIP_COURSE_SLUG`) into every other course
 * in its org — the one-off backfill for "the flagship is always remixed".
 * New courses get the remix on creation (`createCourse`); this catches every
 * course created before that.
 *
 * For each org holding a flagship: every course linked to the org
 * (`course_orgs`), except the flagship and those already linked to it
 * (`course_remixes`), goes through the ordinary `remixCourse`.
 *
 * Order: courses that were ALREADY remixed keep their order untouched.
 * Back-filled courses get the flagship's modules APPENDED after their own,
 * in the flagship's order (`remixCourse` ranks after the current max) — an
 * admin can reorder them afterwards on the course's own board.
 *
 * Idempotent: a re-run finds every course already linked and remixes
 * nothing. Prints `{ remixed, alreadyRemixed, failed: [{ courseId, reason }] }`.
 *
 * Run: pnpm db:remix-flagship-everywhere
 */
import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { remixCourse } from '#/db/course-remixes';
import { coursesNeedingFlagshipRemix } from '#/db/flagship-remix';
import {
  courseOrgsTable,
  courseRemixesTable,
  coursesTable,
} from '#/db/schema';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

async function main(): Promise<void> {
  const flagships = await db
    .select({ orgId: courseOrgsTable.orgId, flagshipId: coursesTable.id })
    .from(coursesTable)
    .innerJoin(courseOrgsTable, eq(courseOrgsTable.courseId, coursesTable.id))
    .where(eq(coursesTable.slug, FLAGSHIP_COURSE_SLUG));

  const counts = {
    remixed: 0,
    alreadyRemixed: 0,
    failed: [] as Array<{ courseId: number; reason: string }>,
  };

  for (const { orgId, flagshipId } of flagships) {
    const orgCourses = await db
      .select({ courseId: courseOrgsTable.courseId })
      .from(courseOrgsTable)
      .where(eq(courseOrgsTable.orgId, orgId))
      .orderBy(courseOrgsTable.courseId);
    const linked = await db
      .select({ courseId: courseRemixesTable.courseId })
      .from(courseRemixesTable)
      .innerJoin(
        courseOrgsTable,
        and(
          eq(courseOrgsTable.courseId, courseRemixesTable.courseId),
          eq(courseOrgsTable.orgId, orgId),
        ),
      )
      .where(eq(courseRemixesTable.sourceCourseId, flagshipId));

    const { toRemix, alreadyRemixed } = coursesNeedingFlagshipRemix({
      orgCourseIds: orgCourses.map((r) => r.courseId),
      flagshipId,
      alreadyRemixedIds: linked.map((r) => r.courseId),
    });
    counts.alreadyRemixed += alreadyRemixed.length;

    for (const courseId of toRemix) {
      try {
        const result = await remixCourse({
          orgId,
          courseId,
          sourceCourseId: flagshipId,
          actorId: null,
        });
        if (result.ok) counts.remixed += 1;
        // Linked between the read above and this write — already done.
        else if (result.reason === 'already-remixed')
          counts.alreadyRemixed += 1;
        else counts.failed.push({ courseId, reason: result.reason });
      } catch (error) {
        counts.failed.push({
          courseId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.info('Flagship remix backfill:', JSON.stringify(counts, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
