import { createHash } from 'node:crypto';
import { z } from 'zod';
import { generateTest } from '#/ai/generate-test';
import {
  AITestGenerationQuestionSchema,
  type ChunkedFreeTextQuestion,
} from '#/ai/schemas';
import { selectAskedQuestions, selectMastery } from '#/db/debrief-attempts';
import {
  deletePreparedDebrief,
  type PreparedDebriefKey,
  selectPreparedFingerprint,
  upsertPreparedDebrief,
} from '#/db/prepared-debriefs';
import { redis } from '#/integrations/upstash/redis';
import {
  isAllCleared,
  masteryOf,
  planAttemptFocus,
} from '#/lib/debrief-mastery';
import { ensureLessonChunks } from '#/lib/knowledge-chunks.server';

export type { PreparedDebriefKey };

/**
 * How long one preparation blocks another for the same pilot and lesson.
 * Covers pause/play, a reload mid-video and a second tab — each of which
 * would otherwise pay for its own model run. Dedupe only, never a clock: the
 * prepared test itself lives in Postgres, because it has to survive the 12h
 * wait before the debrief opens (a Redis TTL could expire and lose it).
 */
const CLAIM_TTL_SECONDS = 60 * 30;

/**
 * Per pilot, not per lesson: every learner gets their own freshly generated
 * set of questions, exactly as when the debrief is generated on demand.
 */
function claimKey({
  userId,
  courseId,
  lessonSlug,
}: PreparedDebriefKey): string {
  return `prepared-debrief:claim:${userId}:${courseId}:${lessonSlug}`;
}

/**
 * The shape of debrief `generateTest` builds. Part of the fingerprint, so a
 * change of shape retires every test prepared in the old one. Bump it with
 * any change a prepared test must not outlive.
 *
 * knowledge-chunks-v1 (2026-11-12): one chunk-tagged written question per
 * hole plus spaced review, replacing the two essay sets.
 */
const DEBRIEF_FORMAT = 'knowledge-chunks-v1';

/**
 * sha256 hex of the debrief format, the lesson's chunk version and the
 * attempt focus (sorted, so order never matters). A prepared test is served
 * only when all three still match: the chunks were not regenerated since (a
 * source change bumps the version) and the pilot's holes and review are the
 * ones it was written for.
 */
export function preparedFingerprint(
  chunkVersion: number,
  focus: { holes: string[]; review: string[] },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        DEBRIEF_FORMAT,
        chunkVersion,
        [...focus.holes].sort(),
        [...focus.review].sort(),
      ]),
    )
    .digest('hex');
}

export type PrepareOutcome =
  | 'prepared'
  | 'already-prepared'
  | 'already-claimed'
  | 'nothing-to-ask'
  | 'no-source';

/**
 * Generate this pilot's next debrief ahead of time and park it server-side,
 * so it is ready the moment the debrief opens.
 *
 * Generation is the slow part of starting a debrief. So it runs while the
 * pilot watches the video, and again right after an attempt finishes with
 * holes left, so the retake is waiting when it reopens. The focus is the one
 * the pilot's CURRENT mastery calls for (`planAttemptFocus`), and questions
 * they have already been asked on this lesson are avoided. The questions are
 * never returned from here: handing them out before the debrief opens would
 * leak it.
 *
 * Skips the model when a test for the current chunk version and focus is
 * already stored, and when every chunk is already cleared.
 */
export async function prepareDebrief(
  k: PreparedDebriefKey & { lessonId: number },
): Promise<PrepareOutcome> {
  const key: PreparedDebriefKey = {
    userId: k.userId,
    courseId: k.courseId,
    lessonSlug: k.lessonSlug,
  };
  const claimed = await redis.set(claimKey(key), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') return 'already-claimed';

  try {
    const lesson = await ensureLessonChunks(
      k.lessonId,
      k.lessonSlug,
      k.courseId,
    );
    if (!lesson) {
      await discardPreparedDebrief(key);
      return 'no-source';
    }
    const mastery = masteryOf(
      lesson.chunks,
      await selectMastery(k.userId, k.lessonId),
    );
    if (isAllCleared(lesson.chunks, mastery)) return 'nothing-to-ask';

    const focus = planAttemptFocus(lesson.chunks, mastery);
    const fingerprint = preparedFingerprint(lesson.version, focus);
    if ((await selectPreparedFingerprint(key)) === fingerprint) {
      return 'already-prepared';
    }
    const test = await generateTest({
      lessonSlug: k.lessonSlug,
      chunks: lesson.chunks,
      context: lesson.context,
      focus,
      avoidQuestions: await selectAskedQuestions(k.userId, k.lessonSlug),
    });
    await upsertPreparedDebrief(key, test, fingerprint);
    return 'prepared';
  } catch (error) {
    // Release the claim so the next play can try again, rather than leaving
    // the pilot with no preparation for half an hour.
    await redis.del(claimKey(key));
    throw error;
  }
}

/**
 * Drop any prepared debrief for this pilot and lesson, without serving it.
 *
 * Called whenever the lesson has no chunks to build from (ledger
 * T8). The course SQL counts a prepared row as making the lesson
 * debrief-bearing (call 11), so a row outliving its source would demand a
 * debrief nobody can generate and hold the course below 100% forever.
 * Deleting it keeps "debrief-bearing" meaning "the debrief can be generated".
 */
export async function discardPreparedDebrief(
  k: PreparedDebriefKey,
): Promise<void> {
  await deletePreparedDebrief(k);
}

const PreparedTestSchema = z.object({
  lessonSlug: z.string(),
  questions: z.array(AITestGenerationQuestionSchema).min(1),
});

/**
 * The prepared debrief, removed as it is read — each one is served once, so a
 * retake gets a fresh set rather than replaying the same questions.
 *
 * Null on a miss; on a test prepared for another chunk version or focus
 * (`currentFingerprint` — the row is still deleted, it can never be served);
 * and on a row that no longer parses as chunk-tagged questions (a shape
 * change across a deploy). The caller then generates on demand.
 */
export async function takePreparedDebrief(
  k: PreparedDebriefKey,
  currentFingerprint: string,
): Promise<{
  lessonSlug: string;
  questions: ChunkedFreeTextQuestion[];
} | null> {
  const row = await deletePreparedDebrief(k);
  if (!row || row.sourceFingerprint !== currentFingerprint) return null;
  const parsed = PreparedTestSchema.safeParse(row.test);
  return parsed.success && parsed.data.lessonSlug === k.lessonSlug
    ? parsed.data
    : null;
}
