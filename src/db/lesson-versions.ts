import {
  and,
  asc,
  type Column,
  count,
  eq,
  exists,
  inArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { isPinnedSnapshot, isPinOf } from '#/db/course-lesson-content';
import { getCourseSlugForCourseId } from '#/db/lesson-access';
import { getLessonPlayback } from '#/db/lesson-playback';
import {
  pinLessons,
  shownUnpinned,
  snapshotLessons,
} from '#/db/lesson-version-sql';
import {
  courseLessonVersionsTable,
  courseModulesTable,
  coursesTable,
  lessonsTable,
  lessonVersionsTable,
  moduleLessonsTable,
} from '#/db/schema';
import { compareVersions } from '#/lib/lesson-version';

/**
 * Snapshots (`lesson_versions`) and pins (`course_lesson_versions`). The app
 * writes neither table anywhere else.
 *
 * A course shows a lesson when one of its `course_modules` holds it in
 * `module_lessons`, and every (course, lesson) shown has a pin. So every write
 * to those two tables that can add or remove a (course, lesson) goes through
 * `changeMembership`.
 *
 * LOCK ORDER, the same in every writer, so that none can deadlock another:
 * 1. the row of the course OWNING the modules, `for no key update`
 *    (`lockModuleOwner`). It holds still which courses show those modules and
 *    which lessons are in them. Not `for update`: that would also block the
 *    foreign-key checks of writers holding another course's row, and two
 *    courses that remix each other would deadlock;
 * 2. the rows of the courses showing them, `for key share`, by id;
 * 3. the `lessons` rows, `for update`, by id, BEFORE the placement is written:
 *    its foreign key share-locks the lesson, and two writers upgrading that
 *    share lock would deadlock.
 */

/** The `tx` handed to a `db.transaction` callback. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

/** Step 1 of the lock order. */
export async function lockModuleOwner(
  tx: Tx,
  ownerCourseId: number,
): Promise<void> {
  await tx
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, ownerCourseId))
    .for('no key update');
}

/** Lock the lessons `l` matching `which`; step 3 of the lock order. */
async function lockLessons(tx: Tx, which: SQL): Promise<number[]> {
  const { rows } = await tx.execute<{ id: number }>(
    sql`select l."id" from "lessons" l where ${which} order by l."id" for update`,
  );
  return rows.map((r) => r.id);
}

/** Delete pins of lessons the courses do not show. */
async function dropUnshownPins(tx: Tx, courseIds: number[]): Promise<void> {
  await tx.execute(sql`delete from "course_lesson_versions"
    where ("course_id", "lesson_id") in (
      select p."course_id", p."lesson_id" from "course_lesson_versions" p
      where p."course_id" in ${courseIds} and not exists (
        select 1 from "course_modules" cm
        join "module_lessons" ml on ml."module_id" = cm."module_id"
        where cm."course_id" = p."course_id" and ml."lesson_id" = p."lesson_id"
      )
      order by 1, 2 for update
    )`);
}

/**
 * Pin every member lesson lacking a pin to the working copy's version
 * (creating its snapshot if untaken) and delete pins of lessons the course no
 * longer shows. Existing pins are never moved.
 *
 * Membership writers call `changeMembership`, which ends with this.
 */
export async function syncCourseLessonVersions(
  tx: Tx,
  courseIds: number[],
): Promise<{ createdVersionIds: number[] }> {
  if (courseIds.length === 0) return { createdVersionIds: [] };
  await dropUnshownPins(tx, courseIds);

  const unpinned = shownUnpinned(courseIds);
  // Locked before its content is read, so a snapshot and an edit serialise.
  const lessonIds = await lockLessons(tx, unpinned);
  if (lessonIds.length === 0) return { createdVersionIds: [] };

  // `unpinned` asked again: another writer may have pinned one while this
  // waited, and a needless snapshot would lock the version its author is on.
  const { rows } = await tx.execute<{ id: number }>(
    snapshotLessons(sql`l."id" in ${lessonIds} and ${unpinned}`),
  );
  await tx.execute(
    pinLessons(sql`cm."course_id" in ${courseIds} and l."id" in ${lessonIds}`),
  );
  return { createdVersionIds: rows.map((r) => r.id) };
}

/**
 * Run `write`, which adds lessons to or removes them from `courseIds`, with
 * the pins kept right around it. `lessonIds` are the lessons it touches. Call
 * `lockModuleOwner` first: the two lists are only stable under it.
 *
 * Pins of lessons the courses do not show go BEFORE the write (the code before
 * lesson versions unlinked without dropping pins): once the placement exists
 * such a pin looks live, and the lesson would come back on its old version.
 */
export async function changeMembership<T>(
  tx: Tx,
  scope: { courseIds: number[]; lessonIds: number[] },
  write: () => Promise<T>,
): Promise<{ result: T; createdVersionIds: number[] }> {
  // Locked so that deleting one of these courses waits, and one already
  // deleted is left out rather than failing the pin's foreign key.
  const courses =
    scope.courseIds.length === 0
      ? []
      : await tx
          .select({ id: coursesTable.id })
          .from(coursesTable)
          .where(inArray(coursesTable.id, scope.courseIds))
          .orderBy(asc(coursesTable.id))
          .for('key share');
  const courseIds = courses.map((c) => c.id);

  // With any lesson already missing its pin: `sync` will need those locks too,
  // and taking them later would be out of order.
  const touched = [
    ...(scope.lessonIds.length > 0 ? [sql`l."id" in ${scope.lessonIds}`] : []),
    ...(courseIds.length > 0 ? [shownUnpinned(courseIds)] : []),
  ];
  if (touched.length > 0) await lockLessons(tx, sql.join(touched, sql` or `));
  if (courseIds.length > 0) await dropUnshownPins(tx, courseIds);

  const result = await write();
  const { createdVersionIds } = await syncCourseLessonVersions(tx, courseIds);
  return { result, createdVersionIds };
}

export async function getCourseIdsShowingModule(
  tx: Tx,
  moduleId: number,
): Promise<number[]> {
  const rows = await tx
    .select({ courseId: courseModulesTable.courseId })
    .from(courseModulesTable)
    .where(eq(courseModulesTable.moduleId, moduleId))
    .orderBy(asc(courseModulesTable.courseId));
  return rows.map((r) => r.courseId);
}

/** The lessons in these modules, for `changeMembership`'s scope. */
export async function getLessonIdsInModules(
  tx: Tx,
  moduleIds: number[],
): Promise<number[]> {
  if (moduleIds.length === 0) return [];
  const rows = await tx
    .selectDistinct({ lessonId: moduleLessonsTable.lessonId })
    .from(moduleLessonsTable)
    .where(inArray(moduleLessonsTable.moduleId, moduleIds));
  return rows.map((r) => r.lessonId);
}

export type UpdateCourseLessonResult =
  | { ok: true; version: string; createdVersionIds: number[] }
  | { ok: false; reason: 'not-found' | 'stale' | 'current' };

/**
 * Move ONE course to the working copy's version. `toVersion` is what the
 * dialog showed; 'stale' when the working copy has moved on.
 */
export async function updateCourseLessonVersion(i: {
  courseId: number;
  lessonId: number;
  toVersion: string;
}): Promise<UpdateCourseLessonResult> {
  const outcome = await db.transaction(async (tx) => {
    const [lesson] = await tx
      .select({ slug: lessonsTable.slug, version: lessonsTable.version })
      .from(lessonsTable)
      .where(eq(lessonsTable.id, i.lessonId))
      .for('update');
    if (!lesson) return { ok: false, reason: 'not-found' } as const;

    const pinned = isPinOf(i.courseId, i.lessonId);
    // Of a lesson the course shows: a pin left behind is not one to move.
    const [pin] = await tx
      .select({ version: lessonVersionsTable.version })
      .from(courseLessonVersionsTable)
      .innerJoin(lessonVersionsTable, isPinnedSnapshot())
      .where(
        and(
          pinned,
          inArray(
            courseLessonVersionsTable.courseId,
            coursesShowing(tx, i.lessonId),
          ),
        ),
      )
      // So the course cannot be deleted under the update below.
      .for('update', { of: courseLessonVersionsTable });
    if (!pin) return { ok: false, reason: 'not-found' } as const;
    if (lesson.version !== i.toVersion) {
      return { ok: false, reason: 'stale' } as const;
    }
    if (pin.version === lesson.version) {
      return { ok: false, reason: 'current' } as const;
    }

    const { rows } = await tx.execute<{ id: number }>(
      snapshotLessons(sql`l."id" = ${i.lessonId}`),
    );
    const [snapshot] = await tx
      .select({ id: lessonVersionsTable.id })
      .from(lessonVersionsTable)
      .where(
        and(
          eq(lessonVersionsTable.lessonId, i.lessonId),
          eq(lessonVersionsTable.version, lesson.version),
        ),
      );
    await tx
      .update(courseLessonVersionsTable)
      .set({ lessonVersionId: snapshot.id, updatedAt: sql`now()` })
      .where(pinned);
    return {
      ok: true,
      slug: lesson.slug,
      version: lesson.version,
      createdVersionIds: rows.map((r) => r.id),
    } as const;
  });
  if (!outcome.ok) return outcome;

  await invalidateCourseDetailsCache(
    await getCourseSlugForCourseId(i.courseId),
  );
  // Best-effort, like the line above: the course has already moved.
  try {
    await getLessonPlayback.invalidate(outcome.slug);
  } catch (error) {
    console.error('Failed to invalidate lesson-playback cache:', error);
  }
  return {
    ok: true,
    version: outcome.version,
    createdVersionIds: outcome.createdVersionIds,
  };
}

/** Ids of the courses showing a lesson now, as a subquery. */
function coursesShowing(ex: Executor, lessonId: number) {
  return ex
    .select({ courseId: courseModulesTable.courseId })
    .from(courseModulesTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.moduleId, courseModulesTable.moduleId),
    )
    .where(eq(moduleLessonsTable.lessonId, lessonId));
}

/** Highest taken version of each lesson; a lesson never taken is absent. */
export async function highestTakenVersions(
  lessonIds: number[],
  ex: Executor = db,
): Promise<Map<number, string>> {
  const highest = new Map<number, string>();
  if (lessonIds.length === 0) return highest;
  const rows = await ex
    .select({
      lessonId: lessonVersionsTable.lessonId,
      version: lessonVersionsTable.version,
    })
    .from(lessonVersionsTable)
    .where(inArray(lessonVersionsTable.lessonId, lessonIds));
  // Stored as text, where '1.9' sorts above '1.10'.
  for (const { lessonId, version } of rows) {
    const current = highest.get(lessonId);
    if (current === undefined || compareVersions(version, current) > 0) {
      highest.set(lessonId, version);
    }
  }
  return highest;
}

/** Courses showing the lesson now, whatever pins say. */
export async function getCoursesUsingLesson(
  lessonId: number,
  ex: Executor = db,
): Promise<{ id: number; name: string }[]> {
  return ex
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(coursesTable)
    .where(inArray(coursesTable.id, coursesShowing(ex, lessonId)))
    .orderBy(asc(coursesTable.name), asc(coursesTable.id));
}

/**
 * How many courses show each lesson pinned to exactly `version`, by default
 * the working copy's. A lesson none is on is absent.
 */
export async function countCoursesOnVersions(
  lessonIds: number[],
  ex: Executor = db,
  version: Column | string = lessonsTable.version,
): Promise<Map<number, number>> {
  if (lessonIds.length === 0) return new Map();
  const rows = await ex
    .select({ lessonId: courseLessonVersionsTable.lessonId, courses: count() })
    .from(courseLessonVersionsTable)
    .innerJoin(lessonVersionsTable, isPinnedSnapshot())
    .innerJoin(
      lessonsTable,
      eq(lessonsTable.id, courseLessonVersionsTable.lessonId),
    )
    .where(
      and(
        inArray(courseLessonVersionsTable.lessonId, lessonIds),
        eq(lessonVersionsTable.version, version),
        // A pin can outlive the lesson's place in the course. `exists`, so a
        // course showing the lesson twice counts once.
        exists(
          ex
            .select({ one: sql`1` })
            .from(courseModulesTable)
            .innerJoin(
              moduleLessonsTable,
              eq(moduleLessonsTable.moduleId, courseModulesTable.moduleId),
            )
            .where(
              and(
                eq(
                  courseModulesTable.courseId,
                  courseLessonVersionsTable.courseId,
                ),
                eq(
                  moduleLessonsTable.lessonId,
                  courseLessonVersionsTable.lessonId,
                ),
              ),
            ),
        ),
      ),
    )
    .groupBy(courseLessonVersionsTable.lessonId);
  return new Map(rows.map((r) => [r.lessonId, r.courses]));
}

/** How many courses show the lesson and are pinned to exactly `version`. */
export async function countCoursesOnVersion(
  lessonId: number,
  version: string,
  ex: Executor = db,
): Promise<number> {
  const counts = await countCoursesOnVersions([lessonId], ex, version);
  return counts.get(lessonId) ?? 0;
}
