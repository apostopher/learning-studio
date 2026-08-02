import { and, eq, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db';
import {
  blobFileAssignmentsTable,
  blobFilesTable,
  coursesTable,
  lessonsTable,
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
 * every imported row, so a row belongs to this course when its LESSON's module
 * points here, or — for the 11 module-only rows — when its module does. The
 * lesson's own module wins where both exist, which is the same D8 rule the
 * pure layer applies: three rows name a module their lesson does not live in,
 * and scoping by the stored module would file them under the wrong course.
 */
export async function getLibraryForCourse(
  courseId: number,
): Promise<{ files: LibraryFileInput[]; assignments: LibraryAssignment[] }> {
  // The lesson's real module, reached through lessons.module_id. Aliased
  // because `modulesTable` is already joined for the module-only rows.
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
    .leftJoin(lessonModule, eq(lessonsTable.moduleId, lessonModule.id))
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
 * against. Returns a list, not one slug, because nothing in the schema stops a
 * file being assigned in two courses; today none are, so this is one row and
 * one gate evaluation, but a shared checklist attached to both courses would
 * otherwise be downloadable from only whichever course happened to sort first.
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
    .leftJoin(lessonModule, eq(lessonsTable.moduleId, lessonModule.id))
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
