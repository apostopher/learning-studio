import { and, type Column, count, eq, isNull } from 'drizzle-orm';
import { db } from '#/db';
import { coursesTable, docs, docURLs } from '#/db/schema';

function courseFilter(col: Column, courseId: number | null) {
  return courseId === null ? isNull(col) : eq(col, courseId);
}

// Lesson chunks (lesson_slug set) are managed by the lesson-embedding backfill,
// not uploaded as admin documents: left in, every lesson would show up in the
// org-wide list as a `lesson:<slug>` "document" that the delete route 400s on.
const adminDocFilter = (courseId: number | null) =>
  and(courseFilter(docs.courseId, courseId), isNull(docs.lessonSlug));

export async function courseExists(courseId: number): Promise<boolean> {
  const rows = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return rows.length > 0;
}

export async function listDocsBySource(
  courseId: number | null,
): Promise<{ sourcePath: string; count: number }[]> {
  return db
    .select({ sourcePath: docs.sourcePath, count: count() })
    .from(docs)
    .where(adminDocFilter(courseId))
    .groupBy(docs.sourcePath)
    .orderBy(docs.sourcePath);
}

export async function deleteDocsBySource(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docs)
    .where(and(eq(docs.sourcePath, sourcePath), adminDocFilter(courseId)));
}

export async function getDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<{ url: string | null }[]> {
  return db
    .select({ url: docURLs.url })
    .from(docURLs)
    .where(
      and(
        eq(docURLs.sourcePath, sourcePath),
        courseFilter(docURLs.courseId, courseId),
      ),
    );
}

export async function deleteDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docURLs)
    .where(
      and(
        eq(docURLs.sourcePath, sourcePath),
        courseFilter(docURLs.courseId, courseId),
      ),
    );
}

export async function upsertDocUrl(
  courseId: number | null,
  sourcePath: string,
  url: string,
): Promise<void> {
  await db
    .insert(docURLs)
    .values({ courseId, sourcePath, url })
    .onConflictDoNothing();
}
