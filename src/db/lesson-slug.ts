import { eq, like, or } from 'drizzle-orm';
import { db } from '#/db';
import { lessonsTable } from '#/db/schema';
import { slugify } from '#/lib/slugify';

/**
 * The next free lesson slug for `name`: the slugified name, or that name with
 * `-2`, `-3`, … appended until nothing holds it.
 *
 * ONE definition, shared by both ways a lesson comes into existence — created
 * into a module (`createLesson`) and created into a discipline
 * (`createLibraryLesson`). A second copy is a second place for the suffix rule
 * to drift, and the two would then mint colliding slugs for the same name.
 *
 * Deliberately NOT org-scoped: `lessons.slug` is the learner-facing URL
 * segment and is unique across the whole table, so a candidate taken by
 * another org is still taken.
 *
 * Not race-free — two concurrent creates of the same name can both read the
 * same taken set. That is pre-existing behaviour, and the database's own
 * unique index is what actually settles it; the loser sees the insert fail
 * rather than a silent duplicate.
 */
export async function nextAvailableLessonSlug(name: string): Promise<string> {
  const base = slugify(name) || 'lesson';
  const taken = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .where(
      or(eq(lessonsTable.slug, base), like(lessonsTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
