import { db } from '#/db';
import { nextAvailableLessonSlug } from '#/db/lesson-slug';
import { lessonsTable } from '#/db/schema';
import type { LibraryLesson } from '#/lib/admin-schemas';

/**
 * Create a lesson straight into a discipline, teaching no course yet.
 *
 * The other creation path, `createLesson` in `db/admin.ts`, creates INTO a
 * module and writes a `module_lessons` placement in the same transaction. This
 * one writes NO placement, deliberately: a library lesson exists as a thing
 * the org knows before any course teaches it, and it enters a course later by
 * being dragged into one. `getOrgLibrary` reads lessons by `org_id`, not by
 * placement, so an unplaced lesson still has a column to appear in — and
 * `getCourseCountsForLessons` returns no entry for it, which the library
 * renders as "in 0 courses" rather than dropping the card.
 *
 * No transaction, because there is only one write. The single insert is its
 * own atomic unit; wrapping it would suggest a second statement exists.
 *
 * The caller must have already established that `disciplineId` belongs to
 * `orgId` — see `findDisciplineInOrg`. Both ids are written onto the row, so a
 * lesson can never claim a discipline in one org and membership of another.
 */
export async function createLibraryLesson(input: {
  orgId: number;
  disciplineId: number;
  name: string;
}): Promise<LibraryLesson> {
  const slug = await nextAvailableLessonSlug(input.name);
  const [created] = await db
    .insert(lessonsTable)
    .values({
      name: input.name,
      slug,
      // Same empty default `createLesson` uses: what a lesson costs is set on
      // the lesson-config surface, not at the moment it is named.
      requiredSubscriptions: [],
      orgId: input.orgId,
      disciplineId: input.disciplineId,
    })
    .returning({
      id: lessonsTable.id,
      name: lessonsTable.name,
      slug: lessonsTable.slug,
      isAvailable: lessonsTable.isAvailable,
      videoRef: lessonsTable.videoRef,
    });

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    // Read back from the row rather than hardcoded to `false`: "configured"
    // means "has a video", and the definition lives in exactly one place
    // (`getOrgLibrary` computes it the same way from the same column).
    isConfigured: created.videoRef !== null,
    isAvailable: created.isAvailable,
    courseCount: 0,
  };
}
