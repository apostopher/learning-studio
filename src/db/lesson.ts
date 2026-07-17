import { eq } from 'drizzle-orm';
import { db } from '#/db';
import type { LessonMaterialGeneration } from '#/types';
import { lessonMaterialTable, lessonsTable } from './schema';

export async function getLessonMaterial(lessonSlug: string) {
  try {
    const rows = await db
      .select()
      .from(lessonMaterialTable)
      .where(eq(lessonMaterialTable.lessonSlug, lessonSlug))
      .limit(1);
    return rows.length === 0 ? null : rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type LessonMaterial = Awaited<ReturnType<typeof getLessonMaterial>>;

/** Resolve a lesson's slug from its id (null if the lesson doesn't exist). */
async function getLessonSlug(lessonId: number): Promise<string | null> {
  const rows = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return rows[0]?.slug ?? null;
}

/** Read the material row for a lesson by id, or null if none / lesson missing. */
export async function getLessonMaterialByLessonId(lessonId: number) {
  const slug = await getLessonSlug(lessonId);
  if (!slug) return null;
  return getLessonMaterial(slug);
}

/**
 * Replace a lesson's material with `material`. No unique constraint exists on
 * lesson_slug, so upsert = delete existing rows for the slug then insert, in a
 * transaction (effective one-material-per-lesson). `attachments` is dropped —
 * lessonMaterialTable has no such column. Returns the saved row, or null when
 * the lesson id doesn't exist.
 */
export async function upsertLessonMaterial(
  lessonId: number,
  material: LessonMaterialGeneration,
) {
  const slug = await getLessonSlug(lessonId);
  if (!slug) return null;

  return db.transaction(async (tx) => {
    await tx
      .delete(lessonMaterialTable)
      .where(eq(lessonMaterialTable.lessonSlug, slug));
    const [inserted] = await tx
      .insert(lessonMaterialTable)
      .values({
        lessonSlug: slug,
        text: material.text,
        keyPoints: material.keyPoints,
        quiz: material.quiz,
        proTips: material.proTips,
        links: material.links ?? null,
        assignments: material.assignments ?? null,
        jobOfTheDay: material.jobOfTheDay ?? null,
      })
      .returning();
    return inserted;
  });
}
