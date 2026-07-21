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
  const sections = htmlToSections(html, sourcePath);
  const toEmbed = sections.flatMap(chunkSectionTokens);
  if (!toEmbed.length) return { chunks: 0 };

  const courseFilter =
    courseId === null ? isNull(docs.courseId) : eq(docs.courseId, courseId);

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch.map((c) => c.text),
      providerOptions: { google: { outputDimensionality: 3072 } },
    });
    allEmbeddings.push(...embeddings);
  }

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
