import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import { resolveCourseProvider } from '#/db/admin';
import { courseModuleIds } from '#/db/course-modules';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { getCourseIdsForLesson } from '#/db/placements';
import { lessonsTable, moduleLessonsTable } from '#/db/schema';
import { redis } from '#/integrations/upstash/redis';
import { PlaybackError } from '#/lib/video-providers/errors';
import {
  type PlaybackResult,
  resolvePlayback,
} from '#/lib/video-providers/resolve.server';
import type { ProviderId } from '#/lib/video-providers/types';

const CACHE_KEY_PREFIX = 'lesson-playback';

/**
 * Playback for a lesson AS TAUGHT BY one course, resolved through that
 * course's stored provider credentials. Null when the lesson is not placed in
 * the course or has no video assigned — callers deliberately render that as
 * the same refusal as "locked", so the route never confirms which slugs are
 * real.
 *
 * The course is explicit because a lesson can be taught by SEVERAL courses via
 * `module_lessons`, and each course has its own provider credentials. This
 * used to resolve the course from the lesson — the lowest course id, so at
 * least stable — which handed a learner in any other course a URL signed with
 * the wrong course's credentials. The route already knows the course (the
 * gate resolved it from the URL), so it passes the id in and membership is
 * checked here through `courseModuleIds`, the single definition of "which
 * modules are in this course".
 */
async function resolveLessonPlaybackUncached(
  lessonSlug: string,
  courseId: number,
): Promise<PlaybackResult | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)),
      ),
    )
    .limit(1);
  if (!lesson?.videoProvider || !lesson.videoRef) return null;

  const provider = lesson.videoProvider as ProviderId;
  const creds = await resolveCourseProvider(courseId, provider);
  // Throws rather than returning null: null here is indistinguishable from
  // "no such lesson" and "no video assigned", which the route deliberately
  // renders as an opaque 403. A missing course credential is neither — it is
  // an admin misconfiguration the learner can do nothing about, and
  // flattening it into the same refusal is how a whole course of lessons can
  // be dead with nothing anywhere saying why. Safe to distinguish: the gate
  // and subscription checks have already passed by the time this runs, so it
  // reveals nothing about which slugs exist.
  if (!creds) {
    throw new PlaybackError(
      'PROVIDER_NOT_CONFIGURED',
      `This course has no ${provider} credentials configured.`,
    );
  }
  return resolvePlayback(provider, lesson.videoRef, creds);
}

/**
 * Cached per course and lesson, with the TTL bounded by the signed URL's OWN
 * expiry — never a default TTL. A cached URL that outlives its signature is a
 * player that fails with no error path.
 *
 * Hand-rolled against the `redis` client directly rather than
 * `cacheWithRedis`: that helper's `expiresExtractor` cannot skip a write —
 * `cached.ts` does `expiresExtractor(result) ?? CACHE_EXPIRY_SECONDS` and then
 * `redis.set` unconditionally, so an extractor returning `null` falls back to
 * the 6h default instead of skipping the cache. That already bit this
 * codebase once (see the comment on `invalidateCourseDetailsCache`'s caller
 * in `db/admin.ts`) and would freeze a `rendering`/`failed` result — which
 * changes on its own — for six hours if used here.
 *
 * So this function decides for itself whether to write at all:
 *  - a cache hit is returned as-is;
 *  - a pending (`rendering`/`failed`) result is returned WITHOUT writing —
 *    it can flip to something else on the next poll;
 *  - a `ready` result with a known `expiresInSeconds` is written with a TTL
 *    derived from that expiry (30s safety margin: a URL handed to a client
 *    at the instant its cache entry expires must still play long enough to
 *    start);
 *  - a `ready` result with `expiresInSeconds: null` is returned WITHOUT
 *    writing — no expiry information means no safe TTL, and guessing one is
 *    how a dead URL gets served with no error path;
 *  - `null` (no such lesson / no video / no credentials) is also returned
 *    WITHOUT writing, for the same reason: there is no bounded lifetime to
 *    cache it under, and the old default-TTL behavior is exactly the bug
 *    this rewrite exists to remove.
 *
 * `options.skipCache` skips the cache READ only — a fresh result is still
 * written under the normal rules above. Exists for recovery: a client that
 * observed a genuine mid-playback rejection (see
 * `VideoPlayerContainer`/`attach-media.ts`) needs a URL the provider has not
 * already refused, and re-fetching through the normal path would just read
 * back the SAME cached (and possibly still-bad) entry the cache TTL hasn't
 * expired yet. Still goes through `evaluateLessonGate` upstream in the route
 * handler — this never becomes an unauthenticated way to hammer the
 * provider's API.
 *
 * Exposes `.invalidate(lessonSlug)` (see below) so a mutation that changes
 * what this would resolve to — `setLessonVideo` in `#/db/admin` — can evict
 * the stale entries instead of leaving learners on a previous video's
 * still-validly-signed URL for up to the remainder of its TTL.
 */
type LessonPlaybackOptions = {
  /** The course the learner is in — the one whose credentials sign the URL. */
  courseId: number;
  skipCache?: boolean;
};

type LessonPlaybackReader = ((
  lessonSlug: string,
  options: LessonPlaybackOptions,
) => Promise<PlaybackResult | null>) & {
  invalidate: (lessonSlug: string) => Promise<void>;
};

const cacheKey = (courseId: number, lessonSlug: string) =>
  `${CACHE_KEY_PREFIX}:${courseId}:${lessonSlug}`;

export const getLessonPlayback: LessonPlaybackReader = Object.assign(
  async (
    lessonSlug: string,
    options: LessonPlaybackOptions,
  ): Promise<PlaybackResult | null> => {
    const key = cacheKey(options.courseId, lessonSlug);

    if (!options.skipCache) {
      const cached = await redis.get<PlaybackResult>(key);
      if (cached) return cached;
    }

    const result = await resolveLessonPlaybackUncached(
      lessonSlug,
      options.courseId,
    );

    if (result?.status === 'ready' && result.expiresInSeconds !== null) {
      const ex = Math.max(1, result.expiresInSeconds - 30);
      await redis.set(key, JSON.stringify(result), { ex });
    }

    return result;
  },
  {
    /**
     * Evict a lesson's cached playback entry in EVERY course teaching it —
     * the entries are keyed per course, and an admin video swap changes what
     * all of them would resolve to. Unconditional — unlike the read path's
     * TTL-bounded writes, the swap must invalidate regardless of whether an
     * entry currently exists, so callers never have to reason about whether
     * one does.
     */
    invalidate: async (lessonSlug: string): Promise<void> => {
      const lessonId = await getLessonIdBySlug(lessonSlug);
      if (lessonId === null) return;
      const courseIds = await getCourseIdsForLesson(lessonId);
      await Promise.all(
        courseIds.map((courseId) => redis.del(cacheKey(courseId, lessonSlug))),
      );
    },
  },
);
