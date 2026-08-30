import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { getCourseBoard } from '#/db/admin';
import { getCourseCountsForLessons } from '#/db/placements';
import { courseOrgsTable, disciplinesTable, lessonsTable } from '#/db/schema';
import type {
  CourseBoard,
  EditorCourseBoard,
  LibraryDiscipline,
  LibraryLesson,
  OrgLibrary,
} from '#/lib/admin-schemas';

/**
 * The whole org's library, grouped by discipline.
 *
 * Scoped by `lessons.org_id` — a lesson is an org-owned item now, not a
 * per-course one. Left-joins `disciplines` rather than inner-joining: a
 * lesson with no `discipline_id` yet must still appear (in `untitled`), not
 * vanish from the board. Grouping happens in JS off one flat row set rather
 * than one query per discipline, since the row set is already scoped and
 * small at this org's scale.
 */
export async function getOrgLibrary(orgId: number): Promise<OrgLibrary> {
  const rows = await db
    .select({
      id: lessonsTable.id,
      name: lessonsTable.name,
      slug: lessonsTable.slug,
      isAvailable: lessonsTable.isAvailable,
      videoRef: lessonsTable.videoRef,
      disciplineId: disciplinesTable.id,
      disciplineName: disciplinesTable.name,
      disciplineSlug: disciplinesTable.slug,
    })
    .from(lessonsTable)
    .leftJoin(
      disciplinesTable,
      eq(lessonsTable.disciplineId, disciplinesTable.id),
    )
    .where(eq(lessonsTable.orgId, orgId));

  // One shared count query for every lesson on the board, rather than one
  // per lesson: `getCourseCountsForLessons` returns a `Map` with no entry at
  // all for a lesson taught by zero courses, so a missing id is defaulted to
  // 0 here rather than the lesson being dropped.
  const counts = await getCourseCountsForLessons(rows.map((r) => r.id));

  const disciplinesById = new Map<number, LibraryDiscipline>();
  const untitled: LibraryLesson[] = [];

  for (const row of rows) {
    const card: LibraryLesson = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      isConfigured: row.videoRef !== null,
      isAvailable: row.isAvailable,
      courseCount: counts.get(row.id) ?? 0,
    };

    if (row.disciplineId === null) {
      untitled.push(card);
      continue;
    }

    let discipline = disciplinesById.get(row.disciplineId);
    if (!discipline) {
      discipline = {
        id: row.disciplineId,
        // The left join guarantees a matching discipline row whenever
        // `disciplineId` is non-null (an FK, never dangling) — the `?? ''`
        // only satisfies drizzle's outer-join nullability typing.
        name: row.disciplineName ?? '',
        slug: row.disciplineSlug ?? '',
        lessons: [],
      };
      disciplinesById.set(row.disciplineId, discipline);
    }
    discipline.lessons.push(card);
  }

  return { disciplines: [...disciplinesById.values()], untitled };
}

/**
 * One editor board per course this org has, via `course_orgs`.
 *
 * Reuses `getCourseBoard` rather than reimplementing its module/placement/
 * dependency assembly. This is one query for the course list plus
 * `getCourseBoard`'s own queries per course (an N+1 at the course level) —
 * accepted at this scale; see the task report for the exact count on a
 * 4-course org.
 */
export async function getOrgEditorBoard(
  orgId: number,
): Promise<EditorCourseBoard[]> {
  const rows = await db
    .select({ courseId: courseOrgsTable.courseId })
    .from(courseOrgsTable)
    .where(eq(courseOrgsTable.orgId, orgId));

  const boards = await Promise.all(rows.map((r) => getCourseBoard(r.courseId)));

  // `getCourseBoard` returns null only when the course id it's given doesn't
  // resolve — shouldn't happen for an id `course_orgs` just gave us (its FK
  // cascades on course delete), but the return type promises no nulls.
  return boards
    .filter((b): b is CourseBoard => b !== null)
    .map(toEditorCourseBoard);
}

/**
 * Drop every video-identifying field from a course board.
 *
 * This route hands EVERY course in the org to EVERY caller with standing on
 * the teaching side, so it must carry strictly less than the per-course board
 * does. `videoRef` is the field that matters: a bare Mux ref is directly
 * streamable unless every asset is signed-policy-only — an operator setting
 * this code cannot verify — which is why `api/course/details.ts` strips the
 * same fields from the learner payload. `videoProvider` goes with it because
 * nothing reads it either and half a pair is a trap for the next reader.
 *
 * Deleted by destructuring rather than by building a new object field by
 * field: a column added to `boardLessonSchema` later then flows through here
 * automatically, and only the two named fields are ever dropped.
 */
function toEditorCourseBoard(board: CourseBoard): EditorCourseBoard {
  return {
    ...board,
    modules: board.modules.map((mod) => ({
      ...mod,
      lessons: mod.lessons.map(
        ({ videoProvider: _p, videoRef: _r, ...lesson }) => lesson,
      ),
    })),
  };
}
