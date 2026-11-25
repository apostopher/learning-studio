import { asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  pinLessons,
  shownUnpinned,
  snapshotLessons,
} from '#/db/lesson-version-sql';
import {
  courseModulesTable,
  coursesTable,
  moduleLessonsTable,
} from '#/db/schema';

/**
 * Snapshots (`lesson_versions`) and pins (`course_lesson_versions`). The app
 * writes neither table anywhere else.
 *
 * A course shows a lesson when one of its `course_modules` holds it in
 * `module_lessons`, and every (course, lesson) shown has a pin. So every write
 * to those two tables that can add or remove a (course, lesson) goes through
 * `changeMembership`.
 *
 * LOCK ORDER, the same in every membership writer, so that none can deadlock
 * another:
 * 1. the row of the course OWNING the modules, `for no key update`
 *    (`lockModuleOwner`). It holds still which courses show those modules and
 *    which lessons are in them. Not `for update`: that would also block the
 *    foreign-key checks of writers holding another course's row, and two
 *    courses that remix each other would deadlock;
 * 2. the rows of the courses showing them, `for key share`, by id;
 * 3. the `lessons` rows, `for update`, by id, BEFORE the placement is written:
 *    its foreign key share-locks the lesson, and two writers upgrading that
 *    share lock would deadlock.
 * `deleteDisciplineModule` is outside it: its foreign key clears the lessons'
 * module in no set order, so it can deadlock with a writer locking several of
 * them. Postgres then rolls one of the two back whole.
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
 * Pin every member lesson lacking a pin to a snapshot of the working copy
 * (created unless one just like it exists) and delete pins of lessons the course no
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
  // waited, and the snapshot would be one no course uses.
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
