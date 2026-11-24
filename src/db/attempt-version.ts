import { type SQL, sql } from 'drizzle-orm';

/**
 * A debrief attempt belongs to the snapshot it was made from, which it stores
 * (`StoredAttempt.lessonVersionId`). One without it is from before lesson
 * versions and belongs to the lesson's first snapshot.
 *
 * For a query whose `lesson_versions` is the snapshot asked about; `attempt`
 * is what `lesson_test_results` is called in it. `lesson_versions` is written
 * out: as a drizzle column it can render bare and bind to the inner table.
 */
export const attemptIsOfSnapshot = (
  attempt: 't' | 'lesson_test_results',
): SQL => sql`coalesce(
    (${sql.identifier(attempt)}.questions ->> 'lessonVersionId')::int,
    (select min(first.id) from lesson_versions first where first.lesson_id = "lesson_versions"."lesson_id")
  ) = "lesson_versions"."id"`;
