import { asc, eq, isNull } from 'drizzle-orm';
import { generateLessonEmbeddings, lessonMaterialHtml } from '#/ai/embeddings';
import { htmlToSections } from '#/ai/embeddings-helper';
import { db } from '#/db';
import { docs, lessonsTable, lessonVersionsTable } from '#/db/schema';

async function indexLessonVersion(id: number): Promise<void> {
  const [snapshot] = await db
    .select({
      slug: lessonsTable.slug,
      version: lessonVersionsTable.version,
      text: lessonVersionsTable.text,
      proTips: lessonVersionsTable.proTips,
    })
    .from(lessonVersionsTable)
    .innerJoin(lessonsTable, eq(lessonsTable.id, lessonVersionsTable.lessonId))
    .where(eq(lessonVersionsTable.id, id));
  if (!snapshot) throw new Error('No such lesson version');
  await generateLessonEmbeddings({
    lessonVersionId: id,
    lessonSlug: snapshot.slug,
    version: snapshot.version,
    html: lessonMaterialHtml(snapshot),
  });
}

/**
 * Make these snapshots searchable by Viper. Never throws, so a route can hand
 * the promise to `waitUntil`: the snapshot is already taken, and one that
 * fails here keeps whatever rows it had and is picked up by
 * `pnpm db:index-lesson-versions`.
 */
export async function indexLessonVersions(
  ids: number[],
): Promise<{ indexed: number; failed: number[] }> {
  let indexed = 0;
  const failed: number[] = [];
  // One at a time: a remix can take a whole course, and the embedding API is
  // rate limited.
  for (const id of ids) {
    try {
      await indexLessonVersion(id);
      indexed++;
    } catch (error) {
      failed.push(id);
      console.error(`Failed to index lesson version ${id}:`, error);
    }
  }
  return { indexed, failed };
}

/** Snapshots with something to search and no search rows. */
export async function unindexedLessonVersionIds(): Promise<number[]> {
  const rows = await db
    .select({
      id: lessonVersionsTable.id,
      text: lessonVersionsTable.text,
      proTips: lessonVersionsTable.proTips,
    })
    .from(lessonVersionsTable)
    .leftJoin(docs, eq(docs.lessonVersionId, lessonVersionsTable.id))
    .where(isNull(docs.id))
    .orderBy(asc(lessonVersionsTable.id));
  // Asked of the sectioner: text too short to make a chunk never gets a row,
  // so it would be listed on every run.
  return rows
    .filter((r) => htmlToSections(lessonMaterialHtml(r), '').length > 0)
    .map((r) => r.id);
}
