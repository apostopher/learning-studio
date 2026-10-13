import { embed } from 'ai';
import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { embeddingModel } from '#/ai/gemini';
import { db } from '#/db';
import { docs } from '#/db/schema';

export type KBResult = {
  chunk: string;
  heading: string | null;
  similarity: number;
};

/** How many chunks a search returns. */
export const KB_MAX_RESULTS = 5;

/**
 * Cosine similarity below which a chunk is not relevant enough to hand the
 * model. Without a floor the top five were returned for ANY question, so an
 * off-topic one arrived with five unrelated chunks presented as knowledge.
 *
 * Measured, not guessed, on 2026-10-06 against the live `docs` table (7,364
 * rows, gemini-embedding-001):
 *  - on-topic questions scored 0.60–0.79 in their top five;
 *  - off-topic ones (recipes, sport, poems, trivia) never exceeded 0.547;
 *  - the weakest relevant case, the terse "what is VMC", scored 0.572–0.586.
 * 0.56 sits between the two with ~0.013 to spare on each side. Re-measure if
 * the embedding model, chunking or corpus changes substantially.
 */
export const KB_MIN_SIMILARITY = 0.56;

/**
 * Cosine-similarity retrieval over ingested `docs` embeddings for a query.
 * `1 - cosineDistance` = cosine similarity; filtered by KB_MIN_SIMILARITY and
 * ordered desc.
 *
 * `courseId` is required, and null means org-wide docs only. It used to be
 * optional, and omitting it searched EVERY course's documents — which is what
 * the chat tool did, since it never passed one. Resolve it with
 * `resolveKBCourseId`, which checks the caller may read that course.
 *
 * `lessonSlugs` are the lessons whose chunks may be returned. They MUST come
 * from the gate (`allowedLessonSlugs(getGatedCourseForAgent(...))`); never pass
 * slugs from anywhere else. Empty means no lesson chunks at all.
 */
export async function searchKB(
  query: string,
  { courseId, lessonSlugs }: { courseId: number | null; lessonSlugs: string[] },
): Promise<KBResult[]> {
  const { embedding } = await embed({ model: embeddingModel, value: query });
  const similarity = sql<number>`1 - (${cosineDistance(docs.embedding, embedding)})`;
  // Uploaded documents. `lesson_slug IS NULL` is load-bearing: lesson chunks
  // also have course_id NULL, so without it every org-wide search would
  // return every lesson's material, gated or not.
  const documents = and(
    isNull(docs.lessonSlug),
    courseId === null
      ? isNull(docs.courseId)
      : or(eq(docs.courseId, courseId), isNull(docs.courseId)),
  );
  // Lesson chunks: only lessons the caller's gate allowed. Empty = none.
  const scope = lessonSlugs.length
    ? or(documents, inArray(docs.lessonSlug, lessonSlugs))
    : documents;
  return db
    .select({ chunk: docs.chunk, heading: docs.heading, similarity })
    .from(docs)
    .where(and(scope, gt(similarity, KB_MIN_SIMILARITY)))
    .orderBy((t) => desc(t.similarity))
    .limit(KB_MAX_RESULTS);
}
