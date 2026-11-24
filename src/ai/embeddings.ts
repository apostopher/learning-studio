import { embedMany } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { chunkSectionTokens, htmlToSections } from '#/ai/embeddings-helper';
import { embeddingModel } from '#/ai/gemini';
import { db } from '#/db';
import { docs, lessonsTable, lessonVersionsTable } from '#/db/schema';
import type { DocSource } from '#/lib/doc-source';

export type GenerateEmbeddingsArgs = {
  courseId: number | null;
  sourcePath: string;
  html: string;
  source: DocSource;
};

const BATCH_SIZE = 100;

async function embedInBatches(values: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: values.slice(i, i + BATCH_SIZE),
      providerOptions: { google: { outputDimensionality: 3072 } },
    });
    out.push(...embeddings);
  }
  return out;
}

/**
 * Chunk HTML and write course-scoped embeddings into `docs`, replacing any
 * existing rows for this (courseId, sourcePath) first.
 */
export async function generateHTMLEmbeddings({
  courseId,
  sourcePath,
  html,
  source,
}: GenerateEmbeddingsArgs): Promise<{ chunks: number }> {
  const sections = htmlToSections(html, sourcePath);
  const toEmbed = sections.flatMap(chunkSectionTokens);
  if (!toEmbed.length) return { chunks: 0 };

  const courseFilter =
    courseId === null ? isNull(docs.courseId) : eq(docs.courseId, courseId);

  const allEmbeddings = await embedInBatches(toEmbed.map((c) => c.text));

  // Delete-then-insert happens atomically so a failed re-ingest never wipes
  // existing rows without replacing them.
  await db.transaction(async (tx) => {
    await tx.delete(docs).where(
      and(
        eq(docs.sourcePath, sourcePath),
        courseFilter,
        // Lesson chunks (lesson_slug set) are owned by generateLessonEmbeddings;
        // the document path must never delete them.
        isNull(docs.lessonSlug),
      ),
    );

    await Promise.all(
      toEmbed.map((c, i) =>
        tx
          .insert(docs)
          .values({
            courseId,
            sourcePath: c.name,
            heading: c.heading,
            chunk: c.text,
            embedding: allEmbeddings[i],
            source,
          })
          .onConflictDoNothing(),
      ),
    );
  });

  return { chunks: toEmbed.length };
}

/** The lesson fields Viper may quote: the material text and its pro tips. */
export function lessonMaterialHtml(m: {
  text: string | null;
  proTips: string | null;
}): string {
  return [m.text, m.proTips ? `Pro tips: ${m.proTips}` : '']
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Index one snapshot of a lesson as `docs` rows keyed by `lesson_version_id`
 * (course_id null — access is per lesson, decided at search time by
 * getGatedCourseForAgent). Replaces that snapshot's rows and no others: empty
 * material leaves it with none, never with stale ones.
 *
 * The (course_id, source_path, heading, chunk) unique constraint omits
 * lesson_version_id; that is safe only because the slug and version make
 * source_path unique to the snapshot. Keep it that way.
 */
export async function generateLessonEmbeddings({
  lessonVersionId,
  lessonSlug,
  version,
  html,
}: {
  lessonVersionId: number;
  lessonSlug: string;
  version: string;
  html: string;
}): Promise<{ chunks: number }> {
  // The name goes into each chunk's text, which learners' browsers receive as
  // the search tool's output, so it leaves the version out.
  const toEmbed = htmlToSections(html, `lesson:${lessonSlug}`).flatMap(
    chunkSectionTokens,
  );
  const embeddings = toEmbed.length
    ? await embedInBatches(toEmbed.map((c) => c.text))
    : [];

  await db.transaction(async (tx) => {
    // One indexer of a snapshot at a time, so that each deletes what the one
    // before it inserted. The lesson's lock comes first because deleting a
    // lesson takes the two in that order.
    await tx
      .select({ id: lessonsTable.id })
      .from(lessonsTable)
      .where(eq(lessonsTable.slug, lessonSlug))
      .for('key share');
    await tx
      .select({ id: lessonVersionsTable.id })
      .from(lessonVersionsTable)
      .where(eq(lessonVersionsTable.id, lessonVersionId))
      .for('no key update');

    await tx.delete(docs).where(eq(docs.lessonVersionId, lessonVersionId));
    if (toEmbed.length === 0) return;
    await tx
      .insert(docs)
      .values(
        toEmbed.map((c, i) => ({
          courseId: null,
          lessonSlug,
          lessonVersionId,
          sourcePath: `lesson:${lessonSlug}@${version}`,
          heading: c.heading,
          chunk: c.text,
          embedding: embeddings[i],
        })),
      )
      // A passage repeated within the lesson is stored once.
      .onConflictDoNothing();
  });
  return { chunks: toEmbed.length };
}
