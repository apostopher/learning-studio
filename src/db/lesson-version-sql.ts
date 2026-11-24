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

/**
 * Freeze the working copy of each lesson `l` matching `which`; one whose
 * version is already taken is left alone. Returns the ids it created.
 * lesson_material.lesson_slug is not unique: the first row by id counts.
 */
export function snapshotLessons(which: SQL): SQL {
  return sql`insert into "lesson_versions" (
      "lesson_id", "version", "name", "video_provider", "video_ref", "other_video_ids",
      "text", "key_points", "quiz", "pro_tips", "links", "assignments",
      "job_of_the_day", "test_this", "extra_tab"
    )
    select l."id", l."version", l."name", l."video_provider", l."video_ref", l."other_video_ids",
      m."text", m."key_points", m."quiz", m."pro_tips", m."links", m."assignments",
      m."job_of_the_day", m."test_this",
      case when d."slug" = ${FLAGSHIP_DISCIPLINE_SLUG} then 'jobOfTheDay' else 'testThis' end
    from "lessons" l
    left join "disciplines" d on d."id" = l."discipline_id"
    left join lateral (
      select * from "lesson_material" lm where lm."lesson_slug" = l."slug" order by lm."id" limit 1
    ) m on true
    where ${which}
    on conflict ("lesson_id","version") do nothing
    returning "id"`;
}

/**
 * Pin each lesson `l` a course `cm` shows to the snapshot of its working
 * copy's version. Existing pins are never moved.
 */
export function pinLessons(which: SQL = sql`true`): SQL {
  return sql`insert into "course_lesson_versions" ("course_id","lesson_id","lesson_version_id")
    select distinct cm."course_id", l."id", v."id"
    from "course_modules" cm
    join "module_lessons" ml on ml."module_id" = cm."module_id"
    join "lessons" l on l."id" = ml."lesson_id"
    join "lesson_versions" v on v."lesson_id" = l."id" and v."version" = l."version"
    where ${which}
    on conflict ("course_id","lesson_id") do nothing`;
}
