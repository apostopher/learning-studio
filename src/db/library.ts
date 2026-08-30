import { and, eq, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db';
import {
  blobFileAssignmentsTable,
  blobFilesTable,
  coursesTable,
  lessonsTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';
import type { LibraryAssignment, LibraryFileInput } from '#/lib/library-gating';

/**
 * Library files are identified by their blob pathname prefix, not a column.
 *
 * `scripts/import-course.ts` preserved the old platform's `library-` prefix
 * precisely so this check keeps working. It is redundant against today's data
 * — all 92 rows match — but `blob_files` is a general-purpose table that
 * course covers and training docs also write to, so dropping the filter would
 * start surfacing them in the student library the moment the admin UI lands.
 */
const LIBRARY_URL_PATTERN = '%/library-%';

/**
 * A course's library files and their assignments, as slugs.
 *
 * Assignments carry integer FKs, but every gate predicate in this codebase is
 * keyed by slug, so the join resolves them here rather than making the pure
 * layer take an id→slug map it would only ever use one way.
 *
 * Scoping is derived, not stored: `blob_file_assignments.course_id` is null on
 * every imported row, so a row belongs to this course when its LESSON is
 * PLACED here (via `module_lessons`), or — for the 11 module-only rows — when
 * its module does. The lesson's own placement wins where both exist, which is
 * the same D8 rule the pure layer applies: three rows name a module their
 * lesson does not live in, and scoping by the stored module would file them
 * under the wrong course.
 *
 * Behaviour change from the pre-placements join: a lesson can now be taught by
 * several courses (one `module_lessons` row each), so its files show up in
 * every course teaching it, not just the one named by the now-legacy
 * `lessons.module_id`. That is correct — the file belongs to the lesson, not
 * to a single course — but it is a real change from "one course, one file
 * list" to "every teaching course gets the file".
 *
 * The reverse is also newly possible: `lessons.module_id` was `NOT NULL`, so
 * every lesson-linked assignment used to resolve exactly one course. A lesson
 * with no `module_lessons` row at all (not yet backfilled, or removed from
 * every course) now resolves to NONE — its files vanish from every course's
 * library, and `getCourseSlugsForLibraryFile` returns `[]` for them, which
 * the download route turns into a hard 403. Arguably correct for a lesson no
 * course actually teaches, but it is a new failure mode that depends on
 * backfill completeness, not a pre-existing one.
 *
 * It does not produce duplicate ROWS for a single course's list: `linkLesson`
 * (`src/db/placements.ts`) checks-then-inserts to keep one placement per
 * course per lesson, so at most one `module_lessons` row normally satisfies
 * `eq(lessonModule.courseId, courseId)` for a given lesson. That check is
 * application-level, not a database constraint — the unique index is on
 * `(module_id, lesson_id)`, i.e. per MODULE, and `admin.ts`'s `createLesson`
 * is a second, independent writer — so it is not a guarantee. If it were ever
 * violated, the resulting duplicate rows would be harmless here rather than
 * merely rare: both would carry the identical `moduleSlug` (read from the
 * assignment's own stored module, not from the placement) and `lessonSlug`,
 * and `resolveLibraryFiles` (`src/lib/library-gating.ts`) is idempotent under
 * duplicate assignments — an any-satisfies check plus an earliest-position
 * `reduce` — so a second identical row changes nothing it returns.
 */
export async function getLibraryForCourse(
  courseId: number,
): Promise<{ files: LibraryFileInput[]; assignments: LibraryAssignment[] }> {
  // The course-in-context module a placed lesson lives in, reached through
  // module_lessons. Aliased because `modulesTable` is already joined for the
  // module-only rows.
  const lessonModule = alias(modulesTable, 'lesson_module');

  const rows = await db
    .select({
      fileId: blobFilesTable.id,
      name: blobFilesTable.name,
      size: blobFilesTable.size,
      type: blobFilesTable.type,
      moduleSlug: modulesTable.slug,
      lessonSlug: lessonsTable.slug,
    })
    .from(blobFileAssignmentsTable)
    .innerJoin(
      blobFilesTable,
      eq(blobFileAssignmentsTable.fileId, blobFilesTable.id),
    )
    .leftJoin(
      modulesTable,
      eq(blobFileAssignmentsTable.moduleId, modulesTable.id),
    )
    .leftJoin(
      lessonsTable,
      eq(blobFileAssignmentsTable.lessonId, lessonsTable.id),
    )
    .leftJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .leftJoin(lessonModule, eq(lessonModule.id, moduleLessonsTable.moduleId))
    .where(
      and(
        like(blobFilesTable.url, LIBRARY_URL_PATTERN),
        or(
          eq(lessonModule.courseId, courseId),
          and(
            sql`${lessonsTable.id} is null`,
            eq(modulesTable.courseId, courseId),
          ),
        ),
      ),
    );

  // 21 files carry more than one assignment, so the join returns a file once
  // per row. Dedupe here rather than in the pure layer, which is given a file
  // list and an assignment list precisely so it never has to.
  const files = new Map<number, LibraryFileInput>();
  const assignments: LibraryAssignment[] = [];

  for (const row of rows) {
    if (!files.has(row.fileId)) {
      files.set(row.fileId, {
        id: row.fileId,
        name: row.name,
        size: row.size,
        type: row.type,
      });
    }
    assignments.push({
      fileId: row.fileId,
      moduleSlug: row.moduleSlug,
      lessonSlug: row.lessonSlug,
    });
  }

  return { files: [...files.values()], assignments };
}

/**
 * Every course slug this file is reachable from.
 *
 * The download route holds only a file id — the client never learns a course
 * slug for a file — so the gate has to be told which course to evaluate
 * against. Returns a list, not one slug, because a lesson can be placed in
 * several courses via `module_lessons`: a lesson-linked file now genuinely
 * returns one slug per course teaching that lesson (previously at most one,
 * via the single `lessons.module_id`), and a shared checklist attached to
 * several courses would otherwise be downloadable from only whichever course
 * happened to sort first.
 */
export async function getCourseSlugsForLibraryFile(
  fileId: number,
): Promise<string[]> {
  const lessonModule = alias(modulesTable, 'lesson_module');
  const moduleCourse = alias(coursesTable, 'module_course');
  const lessonCourse = alias(coursesTable, 'lesson_course');

  const rows = await db
    .selectDistinct({
      viaModule: moduleCourse.slug,
      viaLesson: lessonCourse.slug,
    })
    .from(blobFileAssignmentsTable)
    .leftJoin(
      modulesTable,
      eq(blobFileAssignmentsTable.moduleId, modulesTable.id),
    )
    .leftJoin(moduleCourse, eq(modulesTable.courseId, moduleCourse.id))
    .leftJoin(
      lessonsTable,
      eq(blobFileAssignmentsTable.lessonId, lessonsTable.id),
    )
    .leftJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .leftJoin(lessonModule, eq(lessonModule.id, moduleLessonsTable.moduleId))
    .leftJoin(lessonCourse, eq(lessonModule.courseId, lessonCourse.id))
    .where(eq(blobFileAssignmentsTable.fileId, fileId));

  // The lesson's course wins where both resolve — same D8 rule as everywhere
  // else, and the reason the three mismatched rows land in the right course.
  const slugs = new Set<string>();
  for (const row of rows) {
    const slug = row.viaLesson ?? row.viaModule;
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * The blob URL and download filename for one file.
 *
 * Split from `getLibraryForCourse` so the URL is fetched only on the download
 * path, by the one caller that has already re-run the gate. The student-facing
 * query has no column for it at all, which is what makes "the client only ever
 * holds a file id" (D10) a property of the code rather than a convention.
 */
export async function getLibraryFileForDownload(
  fileId: number,
): Promise<{ url: string; name: string; type: string } | null> {
  const [row] = await db
    .select({
      url: blobFilesTable.url,
      name: blobFilesTable.name,
      type: blobFilesTable.type,
    })
    .from(blobFilesTable)
    .where(
      and(
        eq(blobFilesTable.id, fileId),
        like(blobFilesTable.url, LIBRARY_URL_PATTERN),
      ),
    );
  return row ?? null;
}
