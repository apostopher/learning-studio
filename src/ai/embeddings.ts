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

/**
 * Chunk HTML and write course-scoped embeddings into `docs`, replacing any
 * existing rows for this (courseId, sourcePath) first.
 */
export async function generateHTMLEmbeddings({
  courseId,
  sourcePath,
  html,
}: GenerateEmbeddingsArgs): Promise<{ chunks: number }> {
  const courseFilter =
    courseId === null ? isNull(docs.courseId) : eq(docs.courseId, courseId);

  await db
    .delete(docs)
    .where(and(eq(docs.sourcePath, sourcePath), courseFilter));

  const sections = htmlToSections(html, sourcePath);
  const toEmbed = sections.flatMap(chunkSectionTokens);
  if (!toEmbed.length) return { chunks: 0 };

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch.map((c) => c.text),
    });
    allEmbeddings.push(...embeddings);
  }

  await Promise.all(
    toEmbed.map((c, i) =>
      db
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

  return { chunks: toEmbed.length };
}
