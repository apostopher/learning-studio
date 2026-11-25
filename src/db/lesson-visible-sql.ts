import { type Column, type SQL, sql } from 'drizzle-orm';

/**
 * Whether the learners of `viewer` see the query's `lessons` row in the module
 * of its `module_lessons` row.
 *
 * Each course decides for its own modules (`course_lesson_visibility`), so in a
 * borrowed one the OWNER's answer counts: hidden there is hidden in every course
 * borrowing it. A course that hides a lesson hides every copy it shows, a
 * borrowed one included.
 *
 * Where a course never said, `lessons.is_available` is what it starts from.
 * Nothing writes that any more: a new lesson starts hidden, and one from before
 * courses decided starts as it was. The same start for the viewer as for the
 * owner would undo the owner's answer, hence `not exists` rather than a second
 * coalesce.
 *
 * Written out, not interpolated: drizzle renders a column of a one-table query
 * bare, and inside these subqueries that would be the subquery's own.
 */
export const lessonVisible = (viewer: Column | number): SQL<boolean> =>
  sql<boolean>`(coalesce((
      select v."is_visible" from "course_lesson_visibility" v
      join "modules" vm on vm."course_id" = v."course_id"
      where vm."id" = "module_lessons"."module_id" and v."lesson_id" = "lessons"."id"
    ), "lessons"."is_available") and not exists (
      select 1 from "course_lesson_visibility" v
      where v."course_id" = ${viewer} and v."lesson_id" = "lessons"."id" and not v."is_visible"
    ))`;
