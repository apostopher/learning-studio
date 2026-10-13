import { embedMany } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { embeddingModel } from '#/ai/gemini';
import { db } from '#/db';
import { docs } from '#/db/schema';
import { htmlToSections, chunkSectionTokens } from '#/ai/embeddings-helper';

export type GenerateEmbeddingsArgs = {
  courseId: number | null;
  sourcePath: string;
  html: string;
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
    await tx
      .delete(docs)
      .where(and(eq(docs.sourcePath, sourcePath), courseFilter));

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
          })
          .onConflictDoNothing(),
      ),
    );
  });

  return { chunks: toEmbed.length };
}

/** The lesson fields Viper may quote: the material text and its pro tips. */
export function lessonMaterialHtml(m: {
  text: string;
  proTips: string | null;
}): string {
  return [m.text, m.proTips ? `Pro tips: ${m.proTips}` : '']
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Re-index one lesson's material as `docs` rows keyed by `lesson_slug`
 * (course_id null — access is per lesson, decided at search time by
 * getGatedCourseForAgent). Always replaces: empty material leaves the lesson
 * with no chunks, never with stale ones.
 *
 * The (course_id, source_path, heading, chunk) unique constraint omits
 * lesson_slug; that is safe only because `lesson:${lessonSlug}` makes
 * source_path lesson-unique. Keep it that way.
 */
export async function generateLessonEmbeddings({
  lessonSlug,
  html,
}: {
  lessonSlug: string;
  html: string;
}): Promise<{ chunks: number }> {
  const toEmbed = htmlToSections(html, `lesson:${lessonSlug}`).flatMap(
    chunkSectionTokens,
  );
  const embeddings = toEmbed.length
    ? await embedInBatches(toEmbed.map((c) => c.text))
    : [];

  await db.transaction(async (tx) => {
    await tx.delete(docs).where(eq(docs.lessonSlug, lessonSlug));
    if (toEmbed.length === 0) return;
    await tx
      .insert(docs)
      .values(
        toEmbed.map((c, i) => ({
          courseId: null,
          lessonSlug,
          sourcePath: c.name,
          heading: c.heading,
          chunk: c.text,
          embedding: embeddings[i],
        })),
      )
      .onConflictDoNothing();
  });
  return { chunks: toEmbed.length };
}
