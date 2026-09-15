import { asc, eq } from 'drizzle-orm';
import { db } from '#/db';
import { getCourseBoard } from '#/db/admin';
import { getCourseIdsForLessons } from '#/db/placements';
import {
  courseOrgsTable,
  disciplineModulesTable,
  disciplinesTable,
  lessonsTable,
} from '#/db/schema';
import type {
  CourseBoard,
  EditorCourseBoard,
  LibraryDiscipline,
  LibraryDisciplineModule,
  LibraryLesson,
  OrgLibrary,
} from '#/lib/admin-schemas';

/** `library_rank` ascending, unranked (never dragged) last, then id. */
function byLibraryOrder(
  a: { id: number; libraryRank: number | null },
  b: { id: number; libraryRank: number | null },
): number {
  if (a.libraryRank === null && b.libraryRank === null) return a.id - b.id;
  if (a.libraryRank === null) return 1;
  if (b.libraryRank === null) return -1;
  return a.libraryRank - b.libraryRank || a.id - b.id;
}

/**
 * The whole org's library, grouped by discipline.
 *
 * Scoped by `lessons.org_id` — a lesson is an org-owned item now, not a
 * per-course one. Left-joins `disciplines` rather than inner-joining: a
 * lesson with no `discipline_id` yet must still appear (in `untitled`), not
 * vanish from the board. Grouping happens in JS off one flat row set rather
 * than one query per discipline, since the row set is already scoped and
 * small at this org's scale.
 *
 * The org's disciplines are read SEPARATELY and seed the grouping, so a
 * discipline holding no lessons is still a column. Derived from the lesson
 * rows alone it would not be: a discipline created a moment ago has nothing
 * joined to it, so the screen that just created it would show nothing new and
 * the create button would look broken. Seeding also fixes the column ORDER,
 * which was previously whatever sequence the lesson rows happened to arrive
 * in. A lesson pointing at a discipline the seed did not return still gets a
 * column of its own from the join — misfiled data stays visible rather than
 * silently falling into `untitled`.
 */
export async function getOrgLibrary(orgId: number): Promise<OrgLibrary> {
  const [rows, disciplineRows, moduleRows] = await Promise.all([
    db
      .select({
        id: lessonsTable.id,
        name: lessonsTable.name,
        slug: lessonsTable.slug,
        isAvailable: lessonsTable.isAvailable,
        videoRef: lessonsTable.videoRef,
        videoProvider: lessonsTable.videoProvider,
        // The lesson's own gates. Carried so the card the editor draws the
        // instant a lesson is dropped shows the real chips rather than
        // inventing "free, no level, no debrief" and flipping a moment later.
        levels: lessonsTable.levels,
        requiredSubscriptions: lessonsTable.requiredSubscriptions,
        hasDebrief: lessonsTable.hasDebrief,
        needsVideoWatch: lessonsTable.needsVideoWatch,
        disciplineId: disciplinesTable.id,
        disciplineName: disciplinesTable.name,
        disciplineSlug: disciplinesTable.slug,
        disciplineModuleId: lessonsTable.disciplineModuleId,
        libraryRank: lessonsTable.libraryRank,
      })
      .from(lessonsTable)
      .leftJoin(
        disciplinesTable,
        eq(lessonsTable.disciplineId, disciplinesTable.id),
      )
      .where(eq(lessonsTable.orgId, orgId)),
    db
      .select({
        id: disciplinesTable.id,
        name: disciplinesTable.name,
        slug: disciplinesTable.slug,
      })
      .from(disciplinesTable)
      .where(eq(disciplinesTable.orgId, orgId))
      .orderBy(asc(disciplinesTable.name)),
    db
      .select({
        id: disciplineModulesTable.id,
        disciplineId: disciplineModulesTable.disciplineId,
        name: disciplineModulesTable.name,
        rank: disciplineModulesTable.rank,
      })
      .from(disciplineModulesTable)
      .innerJoin(
        disciplinesTable,
        eq(disciplinesTable.id, disciplineModulesTable.disciplineId),
      )
      .where(eq(disciplinesTable.orgId, orgId))
      .orderBy(
        asc(disciplineModulesTable.rank),
        asc(disciplineModulesTable.id),
      ),
  ]);

  // One shared membership query for every lesson on the board, rather than
  // one per lesson: `getCourseIdsForLessons` returns a `Map` with no entry at
  // all for a lesson taught by zero courses, so a missing id is defaulted to
  // an empty list here rather than the lesson being dropped. The count the
  // card shows is derived from the same list the lesson dialog reads.
  const courseIdsByLesson = await getCourseIdsForLessons(rows.map((r) => r.id));

  // Seeded from the disciplines table, in name order, BEFORE any lesson or
  // module is read — so the map's insertion order is the column order and an
  // empty discipline already has its column by the time modules and lessons
  // are filed into it.
  const disciplinesById = new Map<number, LibraryDiscipline>(
    disciplineRows.map((d) => [
      d.id,
      { id: d.id, name: d.name, slug: d.slug, modules: [], untitled: [] },
    ]),
  );

  // The inner join guarantees a matching discipline row whenever a module
  // row exists, but the SEED above may still miss it (same reasoning as the
  // lesson fallback below) — get-or-create rather than assuming presence.
  function disciplineFor(
    id: number,
    name: string | null,
    slug: string | null,
  ): LibraryDiscipline {
    let discipline = disciplinesById.get(id);
    if (!discipline) {
      discipline = {
        id,
        name: name ?? '',
        slug: slug ?? '',
        modules: [],
        untitled: [],
      };
      disciplinesById.set(id, discipline);
    }
    return discipline;
  }

  // Filed in whatever order the query returns; sorted into (rank, id) order
  // below, alongside the lessons, rather than trusted from the query alone.
  for (const m of moduleRows) {
    const discipline = disciplineFor(m.disciplineId, null, null);
    const libraryModule: LibraryDisciplineModule = {
      id: m.id,
      name: m.name,
      rank: Number(m.rank),
      lessons: [],
    };
    discipline.modules.push(libraryModule);
  }

  // Lessons are filed by rank AFTER every row is seen, not as each row
  // arrives — `library_rank` compares lessons within the same box, and a
  // card's box (module vs. Untitled) isn't known until its own row is read.
  type RankedLesson = {
    id: number;
    card: LibraryLesson;
    libraryRank: number | null;
  };
  const untitled: LibraryLesson[] = [];
  const rankedByModuleId = new Map<number, RankedLesson[]>();
  const rankedUntitledByDisciplineId = new Map<number, RankedLesson[]>();

  for (const row of rows) {
    // `?? null` rather than trusting the column type: drizzle's mock-free
    // shape guarantees `null`, but nothing enforces it on a raw row object,
    // and `undefined !== null` would otherwise file a card into a
    // module keyed by `undefined` — filed nowhere any real module reads.
    const disciplineModuleId = row.disciplineModuleId ?? null;
    const card: LibraryLesson = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      isConfigured: row.videoRef !== null,
      // The provider name, never the ref — see `libraryLessonSchema`.
      videoProvider: row.videoProvider as LibraryLesson['videoProvider'],
      isAvailable: row.isAvailable,
      courseCount: (courseIdsByLesson.get(row.id) ?? []).length,
      courseIds: courseIdsByLesson.get(row.id) ?? [],
      disciplineModuleId,
      levels: row.levels as LibraryLesson['levels'],
      requiredSubscriptions:
        row.requiredSubscriptions as LibraryLesson['requiredSubscriptions'],
      hasDebrief: row.hasDebrief,
      needsVideoWatch: row.needsVideoWatch,
    };

    if (row.disciplineId === null) {
      // Org-level `untitled` (no discipline at all) — unchanged, not
      // library-rank ordered.
      untitled.push(card);
      continue;
    }

    // The left join guarantees a matching discipline row whenever
    // `disciplineId` is non-null (an FK, never dangling) — the `?? ''` only
    // satisfies drizzle's outer-join nullability typing.
    disciplineFor(row.disciplineId, row.disciplineName, row.disciplineSlug);

    const libraryRank =
      row.libraryRank === null || row.libraryRank === undefined
        ? null
        : Number(row.libraryRank);
    const ranked: RankedLesson = { id: card.id, card, libraryRank };

    if (disciplineModuleId !== null) {
      const list = rankedByModuleId.get(disciplineModuleId) ?? [];
      list.push(ranked);
      rankedByModuleId.set(disciplineModuleId, list);
    } else {
      const list = rankedUntitledByDisciplineId.get(row.disciplineId) ?? [];
      list.push(ranked);
      rankedUntitledByDisciplineId.set(row.disciplineId, list);
    }
  }

  // `library_rank` sorts within a box, then the rank is stripped — the card
  // does not read it and the schema does not declare it.
  for (const discipline of disciplinesById.values()) {
    // The query orders modules by (rank, id) itself, but a mocked or
    // otherwise unordered row source cannot be trusted to preserve that —
    // sort here too rather than assuming the query already did it.
    discipline.modules.sort((a, b) => a.rank - b.rank || a.id - b.id);
    for (const libraryModule of discipline.modules) {
      libraryModule.lessons = (rankedByModuleId.get(libraryModule.id) ?? [])
        .sort(byLibraryOrder)
        .map((r) => r.card);
    }
    discipline.untitled = (
      rankedUntitledByDisciplineId.get(discipline.id) ?? []
    )
      .sort(byLibraryOrder)
      .map((r) => r.card);
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
