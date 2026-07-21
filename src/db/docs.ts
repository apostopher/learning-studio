import { and, count, eq, isNull, type Column } from 'drizzle-orm';
import { db } from '#/db';
import { docs, docURLs, coursesTable } from '#/db/schema';

function courseFilter(col: Column, courseId: number | null) {
  return courseId === null ? isNull(col) : eq(col, courseId);
}

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
    .where(courseFilter(docs.courseId, courseId))
    .groupBy(docs.sourcePath)
    .orderBy(docs.sourcePath);
}

export async function deleteDocsBySource(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docs)
    .where(and(eq(docs.sourcePath, sourcePath), courseFilter(docs.courseId, courseId)));
}

export async function getDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<{ url: string | null }[]> {
  return db
    .select({ url: docURLs.url })
    .from(docURLs)
    .where(
      and(eq(docURLs.sourcePath, sourcePath), courseFilter(docURLs.courseId, courseId)),
    );
}

export async function deleteDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docURLs)
    .where(
      and(eq(docURLs.sourcePath, sourcePath), courseFilter(docURLs.courseId, courseId)),
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
