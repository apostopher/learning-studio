import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { applyContentEdit } from '#/db/lesson-content-edit';
import type { Tx } from '#/db/lesson-versions';
import {
  type MaterialExtraTab,
  materialExtraTabFor,
} from '#/lib/flagship-course';
import type { LessonMaterialGeneration } from '#/types';
import { disciplinesTable, lessonMaterialTable, lessonsTable } from './schema';

/**
 * The working copy's material row, plus which closing tab it shows
 * (`extraTab`): what the admin form edits. Learners get the same shape from
 * their course's snapshot (`getCourseLessonMaterial`), `extraTab` included, so
 * neither re-derives it from a discipline it may not have loaded.
 */
export async function getLessonMaterial(lessonSlug: string) {
  try {
    const rows = await db
      .select({
        material: lessonMaterialTable,
        disciplineSlug: disciplinesTable.slug,
      })
      .from(lessonMaterialTable)
      .innerJoin(
        lessonsTable,
        eq(lessonsTable.slug, lessonMaterialTable.lessonSlug),
      )
      .leftJoin(
        disciplinesTable,
        eq(disciplinesTable.id, lessonsTable.disciplineId),
      )
      .where(eq(lessonMaterialTable.lessonSlug, lessonSlug))
      .limit(1);
    if (rows.length === 0) return null;
    return {
      ...rows[0].material,
      extraTab: materialExtraTabFor(rows[0].disciplineSlug),
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type LessonMaterial = Awaited<ReturnType<typeof getLessonMaterial>>;

/**
 * Resolve a lesson's slug and closing tab from its id (null if the lesson
 * doesn't exist).
 */
async function getLessonFiling(
  lessonId: number,
  ex: Tx | typeof db = db,
): Promise<{ slug: string; extraTab: MaterialExtraTab } | null> {
  const rows = await ex
    .select({ slug: lessonsTable.slug, disciplineSlug: disciplinesTable.slug })
    .from(lessonsTable)
    .leftJoin(
      disciplinesTable,
      eq(disciplinesTable.id, lessonsTable.disciplineId),
    )
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { slug: row.slug, extraTab: materialExtraTabFor(row.disciplineSlug) };
}

/**
 * The admin form's read: the lesson's material row (null when none is saved
 * yet) and its closing tab, which the form needs even for an empty lesson —
 * hence a wrapper rather than the bare row. Null when the lesson is missing.
 */
export async function getLessonMaterialByLessonId(lessonId: number): Promise<{
  extraTab: MaterialExtraTab;
  material: LessonMaterial;
} | null> {
  const filing = await getLessonFiling(lessonId);
  if (!filing) return null;
  return {
    extraTab: filing.extraTab,
    material: await getLessonMaterial(filing.slug),
  };
}

/**
 * Replace a lesson's material with `material`. No unique constraint exists on
 * lesson_slug, so upsert = delete existing rows for the slug then insert, in a
 * transaction (effective one-material-per-lesson). `attachments` is dropped —
 * lessonMaterialTable has no such column. Of `jobOfTheDay` / `testThis` only
 * the one this lesson's discipline shows is written; the other is nulled, so
 * an imported doc carrying both can never leave data no tab displays.
 * Returns the saved row, or null when the lesson id doesn't exist. Throws
 * `VersionEditError` when the lesson's version refuses the edit.
 */
export async function upsertLessonMaterial(
  lessonId: number,
  material: LessonMaterialGeneration,
  version?: string,
) {
  return db.transaction(async (tx) => {
    const lesson = await applyContentEdit(tx, lessonId, version);
    // Read under that lock: filing the lesson elsewhere changes its tab.
    const filing = lesson && (await getLessonFiling(lessonId, tx));
    if (!filing) return null;
    const { slug, extraTab } = filing;

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
        jobOfTheDay:
          extraTab === 'jobOfTheDay' ? (material.jobOfTheDay ?? null) : null,
        testThis: extraTab === 'testThis' ? (material.testThis ?? null) : null,
      })
      .returning();
    return inserted;
  });
}

/**
 * Whether any lesson holds `slug`. Not org-scoped: `lessons.slug` is unique
 * across the whole table. Used by the admin Viper preview to refuse a lesson
 * that does not exist before any model call is made.
 */
export async function lessonExistsBySlug(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(eq(lessonsTable.slug, slug))
    .limit(1);
  return row !== undefined;
}
