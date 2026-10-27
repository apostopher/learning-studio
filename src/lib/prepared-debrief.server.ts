import { createHash } from 'node:crypto';
import { generateTest } from '#/ai/generate-test';
import { type AITest, AITestSchema } from '#/ai/schemas';
import {
  deletePreparedDebrief,
  type PreparedDebriefKey,
  selectPreparedFingerprint,
  upsertPreparedDebrief,
} from '#/db/prepared-debriefs';
import { redis } from '#/integrations/upstash/redis';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';

export type { PreparedDebriefKey };

/**
 * How long one preparation blocks another for the same pilot and lesson.
 * Covers pause/play, a reload mid-video and a second tab — each of which
 * would otherwise pay for its own model run. Dedupe only, never a clock: the
 * prepared test itself lives in Postgres, because it has to survive the 24h
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
 * sha256 hex of the text a debrief is generated from. Stored with the
 * prepared test and compared at claim time, so a test built from material or
 * a transcript that has since changed is never served (spec call 14).
 */
export function sourceFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export type PrepareOutcome =
  | 'prepared'
  | 'already-prepared'
  | 'already-claimed'
  | 'no-source';

/**
 * Generate a debrief ahead of time and park it server-side, so it is ready the
 * moment the debrief opens.
 *
 * The generation pipeline (generate → evaluate → optimise) is the slow part of
 * starting a debrief, and it only needs the lesson's source. So it runs while
 * the pilot watches the video, and again right after a below-par attempt so
 * the retake is waiting when it reopens. The questions are never returned from
 * here: handing them out before the debrief opens would leak it.
 *
 * Skips the model when a test built from the CURRENT source is already stored.
 */
export async function prepareDebrief(
  k: PreparedDebriefKey,
): Promise<PrepareOutcome> {
  const claimed = await redis.set(claimKey(k), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') return 'already-claimed';

  try {
    const source = await resolveDebriefSource(k.lessonSlug, k.courseId);
    if (!source) {
      await discardPreparedDebrief(k);
      return 'no-source';
    }
    const fingerprint = sourceFingerprint(source.text);
    if ((await selectPreparedFingerprint(k)) === fingerprint) {
      return 'already-prepared';
    }
    const test = await generateTest(
      k.lessonSlug,
      source.keyPoints,
      source.text,
    );
    await upsertPreparedDebrief(k, test, fingerprint);
    return 'prepared';
  } catch (error) {
    // Release the claim so the next play can try again, rather than leaving
    // the pilot with no preparation for half an hour.
    await redis.del(claimKey(k));
    throw error;
  }
}

/**
 * Drop any prepared debrief for this pilot and lesson, without serving it.
 *
 * Called whenever `resolveDebriefSource` finds nothing to build from (ledger
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

/**
 * The prepared debrief, removed as it is read — each one is served once, so a
 * retake gets a fresh set rather than replaying the same questions.
 *
 * Null on a miss; on a test built from a source other than
 * `currentFingerprint` (the material or transcript changed after it was
 * generated — the row is still deleted, it can never be served); and on a row
 * that no longer parses (an `AITest` shape change across a deploy). The caller
 * then generates on demand.
 */
export async function takePreparedDebrief(
  k: PreparedDebriefKey,
  currentFingerprint: string,
): Promise<AITest | null> {
  const row = await deletePreparedDebrief(k);
  if (!row || row.sourceFingerprint !== currentFingerprint) return null;
  const parsed = AITestSchema.safeParse(row.test);
  return parsed.success && parsed.data.lessonSlug === k.lessonSlug
    ? parsed.data
    : null;
}
