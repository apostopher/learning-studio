import { embed } from "ai";
import { and, cosineDistance, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { docs } from "@/db/schema";
import { embeddingModel } from "#/ai/gemini";

export type KBResult = {
  chunk: string;
  heading: string | null;
  similarity: number;
};

/**
 * Cosine-similarity retrieval over ingested `docs` embeddings for a query.
 * Scopes to a course plus org-wide (null courseId) docs. `1 - cosineDistance`
 * = cosine similarity; filtered by `minScore` and ordered desc.
 */
export async function searchKB(
  query: string,
  opts: { maxResults?: number; minScore?: number; courseId?: number } = {},
): Promise<KBResult[]> {
  const { maxResults = 5, minScore = 0, courseId } = opts;
  const { embedding } = await embed({ model: embeddingModel, value: query });
  const similarity = sql<number>`1 - (${cosineDistance(docs.embedding, embedding)})`;
  const courseScope =
    courseId == null
      ? undefined
      : or(eq(docs.courseId, courseId), isNull(docs.courseId));
  return db
    .select({ chunk: docs.chunk, heading: docs.heading, similarity })
    .from(docs)
    .where(and(courseScope, gt(similarity, minScore)))
    .orderBy((t) => desc(t.similarity))
    .limit(maxResults);
}
