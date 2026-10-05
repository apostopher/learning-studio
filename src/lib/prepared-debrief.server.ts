import { generateTest } from '#/ai/generate-test';
import { type AITest, AITestSchema } from '#/ai/schemas';
import { redis } from '#/integrations/upstash/redis';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';

const KEY_PREFIX = 'prepared-debrief';
/** How long a prepared debrief waits to be claimed by the Start button. */
const READY_TTL_SECONDS = 60 * 60 * 2;
/**
 * How long one preparation blocks another for the same pilot and lesson.
 * Covers pause/play, a reload mid-video and a second tab — each of which
 * would otherwise pay for its own model run.
 */
const CLAIM_TTL_SECONDS = 60 * 30;

export type PreparedDebriefKey = {
  userId: string;
  courseId: number;
  lessonSlug: string;
};

/**
 * Per pilot, not per lesson: every learner gets their own freshly generated
 * set of questions, exactly as when the debrief is generated on demand.
 */
function key(
  { userId, courseId, lessonSlug }: PreparedDebriefKey,
  part: 'ready' | 'claim',
): string {
  return `${KEY_PREFIX}:${part}:${userId}:${courseId}:${lessonSlug}`;
}

export type PrepareOutcome = 'prepared' | 'already-claimed' | 'no-source';

/**
 * Generate a debrief ahead of time and park it server-side, so it is ready the
 * moment the video unlocks it.
 *
 * The generation pipeline (generate → evaluate → optimise) is the slow part of
 * starting a debrief, and it only needs the lesson's source — not the learner
 * having finished the video. So it runs while they watch. The questions are
 * never returned from here: the debrief is gated behind the video like the
 * rest of the material, and handing it out early would leak it.
 */
export async function prepareDebrief(
  k: PreparedDebriefKey,
): Promise<PrepareOutcome> {
  const claimed = await redis.set(key(k, 'claim'), '1', {
    nx: true,
    ex: CLAIM_TTL_SECONDS,
  });
  if (claimed !== 'OK') return 'already-claimed';

  try {
    const source = await resolveDebriefSource(k.lessonSlug, k.courseId);
    if (!source) return 'no-source';
    const test = await generateTest(
      k.lessonSlug,
      source.keyPoints,
      source.text,
    );
    await redis.set(key(k, 'ready'), JSON.stringify(test), {
      ex: READY_TTL_SECONDS,
    });
    return 'prepared';
  } catch (error) {
    // Release the claim so the next play can try again, rather than leaving
    // the pilot with no preparation for half an hour.
    await redis.del(key(k, 'claim'));
    throw error;
  }
}

/**
 * The prepared debrief, removed as it is read — each one is served once, so a
 * Retake generates a fresh set rather than replaying the same questions.
 *
 * Null on a miss, and also on an entry that no longer parses (an `AITest`
 * shape change across a deploy): the caller falls back to generating on
 * demand, which is what happened before preparation existed.
 */
export async function takePreparedDebrief(
  k: PreparedDebriefKey,
): Promise<AITest | null> {
  const raw = await redis.getdel<unknown>(key(k, 'ready'));
  if (raw == null) return null;
  const parsed = AITestSchema.safeParse(raw);
  return parsed.success && parsed.data.lessonSlug === k.lessonSlug
    ? parsed.data
    : null;
}
