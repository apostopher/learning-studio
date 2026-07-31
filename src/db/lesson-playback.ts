import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { resolveCourseProvider } from '#/db/admin';
import { coursesTable, lessonsTable, modulesTable } from '#/db/schema';
import { cacheWithRedis } from '#/integrations/upstash/redis';
import {
  type PlaybackResult,
  resolvePlayback,
} from '#/lib/video-providers/resolve.server';
import type { ProviderId } from '#/lib/video-providers/types';

/**
 * Playback for a lesson, resolved through the course's stored provider
 * credentials. Null when the lesson does not exist or has no video assigned —
 * callers deliberately render that as the same refusal as "locked", so the
 * route never confirms which slugs are real.
 */
async function resolveLessonPlaybackUncached(
  lessonSlug: string,
): Promise<PlaybackResult | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      courseId: coursesTable.id,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug));
  if (!lesson?.videoProvider || !lesson.videoRef) return null;

  const provider = lesson.videoProvider as ProviderId;
  const creds = await resolveCourseProvider(lesson.courseId, provider);
  if (!creds) return null;
  return resolvePlayback(provider, lesson.videoRef, creds);
}

/**
 * Cached per lesson, with the TTL bounded by the signed URL's OWN expiry —
 * never the default 6h. A cached URL that outlives its signature is a player
 * that fails with no error path, so the extractor is load-bearing, not tuning.
 * Pending (rendering/failed) results are not cached: they change on their own.
 */
export const getLessonPlayback = cacheWithRedis<string, PlaybackResult | null>(
  'lesson-playback',
  resolveLessonPlaybackUncached,
  (result) =>
    result && result.status === 'ready' && result.expiresInSeconds !== null
      ? // 30s safety margin: a URL handed to a client at the instant its cache
        // entry expires must still play long enough to start.
        Math.max(1, result.expiresInSeconds - 30)
      : null,
);
