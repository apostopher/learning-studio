import { getLessonPlayback } from '#/db/lesson-playback';
import { redis } from '#/integrations/upstash/redis';
import { vttToText } from '#/lib/vtt-to-text';

const CACHE_KEY_PREFIX = 'lesson-transcript';

/**
 * Cached for a week, unlike the playback entry it is derived from.
 *
 * The caption URL expires within the hour; the words in the file do not change
 * until the video itself is replaced, and `setLessonVideo` invalidates this
 * alongside the playback cache when that happens. Long is the point: a cold
 * read costs a provider call and a caption download, which a learner waits on.
 */
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * A caption file that flattens to almost nothing — music cues, a single title
 * card — cannot support a debrief. Better to offer none than to generate
 * questions about three words.
 */
const MIN_USEFUL_CHARS = 200;

/**
 * A lesson's video transcript, flattened to prose.
 *
 * Null whenever there is nothing to work with, which is a normal answer rather
 * than a failure: Mux videos carry no text track on this account, a lesson may
 * have no video at all, and a caption fetch can simply fail. Callers treat null
 * as "no transcript source" and the UI offers no debrief.
 */
async function resolveLessonTranscriptUncached(
  lessonSlug: string,
): Promise<string | null> {
  const playback = await getLessonPlayback(lessonSlug);
  if (playback?.status !== 'ready') return null;
  if (!playback.captions) return null;

  let vtt: string;
  try {
    const response = await fetch(playback.captions.vtt, { cache: 'no-store' });
    if (!response.ok) return null;
    vtt = await response.text();
  } catch (error) {
    console.error(`Failed to fetch captions for ${lessonSlug}:`, error);
    return null;
  }

  const text = vttToText(vtt);
  return text.length < MIN_USEFUL_CHARS ? null : text;
}

type LessonTranscriptReader = ((
  lessonSlug: string,
) => Promise<string | null>) & {
  invalidate: (lessonSlug: string) => Promise<void>;
};

/**
 * Only successes are cached. A null is one of several transient things —
 * captions the provider has not generated yet, a failed download — and
 * freezing any of them for a week would leave a lesson permanently
 * debrief-less with nothing to indicate why.
 */
export const getLessonTranscript: LessonTranscriptReader = Object.assign(
  async (lessonSlug: string): Promise<string | null> => {
    const key = `${CACHE_KEY_PREFIX}:${lessonSlug}`;
    const cached = await redis.get<string>(key);
    if (cached) return cached;

    const transcript = await resolveLessonTranscriptUncached(lessonSlug);
    if (transcript) {
      await redis.set(key, transcript, { ex: CACHE_TTL_SECONDS });
    }
    return transcript;
  },
  {
    /**
     * Unconditional, so a caller swapping a lesson's video never has to reason
     * about whether an entry currently exists. The derived key points need no
     * eviction — they are keyed by a hash of this text (see
     * `getDerivedKeyPoints`), so new text simply misses.
     */
    invalidate: async (lessonSlug: string): Promise<void> => {
      await redis.del(`${CACHE_KEY_PREFIX}:${lessonSlug}`);
    },
  },
);
