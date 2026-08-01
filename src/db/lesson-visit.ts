import { sql } from 'drizzle-orm';
import { db } from '#/db';
import { lessonMaterialProgressTable } from '#/db/schema';
import {
  LESSON_VISIT_SECTION,
  type TrackedLessonSection,
} from '#/lib/lesson-visit-section';

/**
 * Upsert one `(user, lesson, section)` row as completed.
 *
 * Idempotent — the unique index makes every repeat a conflict-update rather
 * than a new row, so this is bounded at one row per learner per lesson per
 * section no matter how often they return.
 *
 * Keyed by slug because that is what the table's FK holds. Safe here where it
 * would not be for a pointer: lesson slugs are immutable (`updateLesson` sets
 * `name` only), so there is no rename for a stored slug to rot through, and
 * the FK cascades on delete.
 *
 * `completed: true` is written explicitly rather than relied on — the column
 * defaults to FALSE, so a row's existence alone does not mean anything, and
 * every reader tests the column rather than the row.
 */
async function markSection(
  userId: string,
  lessonSlug: string,
  sectionName: string,
): Promise<void> {
  await db
    .insert(lessonMaterialProgressTable)
    .values({ userId, lessonSlug, sectionName, completed: true })
    .onConflictDoUpdate({
      target: [
        lessonMaterialProgressTable.userId,
        lessonMaterialProgressTable.lessonSlug,
        lessonMaterialProgressTable.sectionName,
      ],
      set: { completed: true, updatedAt: sql`now()` },
    });
}

/**
 * Record that this learner opened one of the lesson's material tabs.
 *
 * The section is a `TrackedLessonSection`, so this can never write
 * `LESSON_VISIT_SECTION` — the page visit is server-verified and must not be
 * forgeable from a client call.
 */
export async function recordLessonSectionTap({
  userId,
  lessonSlug,
  section,
}: {
  userId: string;
  lessonSlug: string;
  section: TrackedLessonSection;
}): Promise<void> {
  await markSection(userId, lessonSlug, section);
}

/**
 * Record that this user has opened this lesson's page.
 *
 * Written server-side from `GET /api/lesson/material` once the gate has
 * released the content, so it is a verified fact rather than a client claim —
 * which is why the section-tap route cannot produce this row. It is the
 * fallback that scores a lesson asking nothing else at all (see lessonPercent).
 */
export async function recordLessonVisit({
  userId,
  lessonSlug,
}: {
  userId: string;
  lessonSlug: string;
}): Promise<void> {
  await markSection(userId, lessonSlug, LESSON_VISIT_SECTION);
}
