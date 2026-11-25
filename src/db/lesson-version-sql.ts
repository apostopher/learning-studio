import { type SQL, sql } from 'drizzle-orm';
import { FLAGSHIP_DISCIPLINE_SLUG } from '#/lib/flagship-course';

/**
 * What freezing and pinning a lesson mean, shared by the migration and
 * `#/db/lesson-versions` so the two cannot differ. No `#/db` import: the
 * migration runs on a database of its own.
 */

/** Lessons `l` that a course (one of `courseIds`, if given) shows unpinned. */
export function shownUnpinned(courseIds?: number[]): SQL {
  const inCourses = courseIds
    ? sql`and cm."course_id" in ${courseIds}`
    : sql.empty();
  return sql`exists (
    select 1 from "module_lessons" ml
    join "course_modules" cm on cm."module_id" = ml."module_id"
    where ml."lesson_id" = l."id" ${inCourses} and not exists (
      select 1 from "course_lesson_versions" p
      where p."course_id" = cm."course_id" and p."lesson_id" = l."id"
    )
  )`;
}

/** What each snapshot column copies from a lesson `l` joined as `fromLessons`. */
const FROZEN: Record<string, SQL> = {
  version: sql`l."version"`,
  name: sql`l."name"`,
  video_provider: sql`l."video_provider"`,
  video_ref: sql`l."video_ref"`,
  other_video_ids: sql`l."other_video_ids"`,
  text: sql`m."text"`,
  key_points: sql`m."key_points"`,
  quiz: sql`m."quiz"`,
  pro_tips: sql`m."pro_tips"`,
  links: sql`m."links"`,
  assignments: sql`m."assignments"`,
  job_of_the_day: sql`m."job_of_the_day"`,
  test_this: sql`m."test_this"`,
  extra_tab: sql`case when d."slug" = ${FLAGSHIP_DISCIPLINE_SLUG} then 'jobOfTheDay' else 'testThis' end`,
};

/** lesson_material.lesson_slug is not unique: the first row by id counts. */
const fromLessons = sql`"lessons" l
    left join "disciplines" d on d."id" = l."discipline_id"
    left join lateral (
      select * from "lesson_material" lm where lm."lesson_slug" = l."slug" order by lm."id" limit 1
    ) m on true`;

/**
 * Snapshot `v` is the working copy of `l` as it is now, its version included.
 * Compared as text: the `json` columns have no equality, and a copy of one is
 * the same text. At worst, equal content stored differently gets a second
 * snapshot.
 */
const isWorkingCopy = sql`(v."lesson_id" = l."id" and ${sql.join(
  Object.entries(FROZEN).map(
    ([column, value]) =>
      sql`v.${sql.identifier(column)}::text is not distinct from (${value})::text`,
  ),
  sql` and `,
)})`;

/**
 * Freeze the working copy of each lesson `l` matching `which`, unless a
 * snapshot of exactly that already exists. The version is a label: several
 * snapshots may carry the same one. Returns the ids it created.
 *
 * `on conflict` is for a database not migrated yet, where a version is still
 * unique in its lesson: there the older snapshot stands.
 */
export function snapshotLessons(which: SQL): SQL {
  return sql`insert into "lesson_versions" ("lesson_id", ${sql.join(
    Object.keys(FROZEN).map((column) => sql.identifier(column)),
    sql`, `,
  )})
    select l."id", ${sql.join(Object.values(FROZEN), sql`, `)}
    from ${fromLessons}
    where ${which}
      and not exists (select 1 from "lesson_versions" v where ${isWorkingCopy})
    on conflict do nothing
    returning "id"`;
}

/**
 * The snapshot of the working copy of a lesson `l` joined as `fromLessons`, to
 * be taken right after `snapshotLessons`, under the same lock. The fallback to
 * the newest one of that version is for the same unmigrated database.
 */
const workingCopySnapshotId = sql`(
    select v."id" from "lesson_versions" v
    where v."lesson_id" = l."id" and v."version" = l."version"
    order by ${isWorkingCopy} desc, v."id" desc limit 1
  )`;

/**
 * Pin each lesson `l` a course `cm` shows to the snapshot of its working copy.
 * Existing pins are never moved.
 */
export function pinLessons(which: SQL = sql`true`): SQL {
  return sql`insert into "course_lesson_versions" ("course_id","lesson_id","lesson_version_id")
    select cm."course_id", l."id", ${workingCopySnapshotId}
    from (
      select distinct cm."course_id", ml."lesson_id"
      from "course_modules" cm
      join "module_lessons" ml on ml."module_id" = cm."module_id"
      where not exists (
        select 1 from "course_lesson_versions" p
        where p."course_id" = cm."course_id" and p."lesson_id" = ml."lesson_id"
      )
    ) cm
    join ${fromLessons} on l."id" = cm."lesson_id"
    where ${which}
    on conflict ("course_id","lesson_id") do nothing`;
}
