import { eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  getPinnedSnapshot,
  type PinnedSnapshot,
} from '#/db/course-lesson-content';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { getCourseIdsForLesson } from '#/db/placements';
import {
  type LessonPlaybackResult,
  resolveSelectedLessonVideo,
} from '#/db/resolve-lesson-video';
import { lessonVersionsTable } from '#/db/schema';
import { redis } from '#/integrations/upstash/redis';
import {
  PRIMARY_VIDEO_LANG,
  VIDEO_LANGUAGES,
  type VideoLang,
} from '#/lib/video-languages';
import { VIDEO_PREVIEW_SECONDS } from '#/lib/video-preview';
import { playbackCacheTtl } from '#/lib/video-providers/mux-captions';
import type { ProviderId } from '#/lib/video-providers/types';

const CACHE_KEY_PREFIX = 'lesson-playback';

export type { LessonPlaybackResult };

/**
 * Playback for a lesson AS TAUGHT BY one course: the video of the version the
 * course is pinned to, resolved through that course's stored provider
 * credentials. Null when that version has no video assigned — like a lesson
 * that is not placed in the course, which callers deliberately render as the
 * same refusal as "locked", so the route never confirms which slugs are real.
 *
 * The course is explicit because a lesson can be taught by SEVERAL courses via
 * `module_lessons`, and each course has its own provider credentials. This
 * used to resolve the course from the lesson — the lowest course id, so at
 * least stable — which handed a learner in any other course a URL signed with
 * the wrong course's credentials. The route already knows the course (the
 * gate resolved it from the URL), so it passes the id in and `getPinnedSnapshot`
 * checks membership.
 */
async function resolveLessonPlaybackUncached(
  snapshot: PinnedSnapshot,
  courseId: number,
  lang: VideoLang,
  previewSeconds: number | undefined,
): Promise<LessonPlaybackResult | null> {
  if (!snapshot.videoProvider || !snapshot.videoRef) return null;

  return resolveSelectedLessonVideo({
    lessonId: snapshot.lessonId,
    provider: snapshot.videoProvider as ProviderId,
    ref: snapshot.videoRef,
    otherVideoIds: snapshot.otherVideoIds,
    courseId,
    lang,
    previewSeconds,
  });
}

/**
 * Cached per course, lesson and version, with the TTL bounded by the signed
 * URL's OWN expiry — never a default TTL. A cached URL that outlives its
 * signature is a player that fails with no error path.
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
 *    start), and at most 60s while Mux captions are generating
 *    (`playbackCacheTtl`);
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
 * Exposes `.invalidate(lessonSlug)` (see below) so a write that changes
 * what this would resolve to — captions becoming ready, `#/db/video-captions`
 * — can evict the stale entries instead of leaving them for the remainder of
 * their TTL.
 */
type LessonPlaybackOptions = {
  /** The course the learner is in — the one whose credentials sign the URL. */
  courseId: number;
  skipCache?: boolean;
  /** The learner's requested language; `en` when absent. */
  lang?: VideoLang;
  /**
   * Play only the first this-many seconds: a free seat on a paid lesson.
   * Cached apart from the full playback, which must never answer it.
   */
  previewSeconds?: number | null;
};

type LessonPlaybackReader = ((
  lessonSlug: string,
  options: LessonPlaybackOptions,
) => Promise<LessonPlaybackResult | null>) & {
  invalidate: (lessonSlug: string) => Promise<void>;
};

const ALL_LANGS: readonly VideoLang[] = [
  PRIMARY_VIDEO_LANG,
  ...VIDEO_LANGUAGES,
];

// Keyed per language as well: a cached French result must never answer an
// English request, and vice versa. And per version: a lesson removed from a
// course and added back on a newer one must not play the old video.
const cacheKey = (
  courseId: number,
  lessonSlug: string,
  versionId: number,
  lang: VideoLang,
  previewSeconds?: number,
) =>
  `${CACHE_KEY_PREFIX}:${courseId}:${lessonSlug}:${versionId}:${lang}${
    previewSeconds === undefined ? '' : `:preview${previewSeconds}`
  }`;

export const getLessonPlayback: LessonPlaybackReader = Object.assign(
  async (
    lessonSlug: string,
    options: LessonPlaybackOptions,
  ): Promise<LessonPlaybackResult | null> => {
    const lang = options.lang ?? PRIMARY_VIDEO_LANG;
    const previewSeconds = options.previewSeconds ?? undefined;
    const snapshot = await getPinnedSnapshot(lessonSlug, options.courseId);
    if (!snapshot) return null;
    const key = cacheKey(
      options.courseId,
      lessonSlug,
      snapshot.id,
      lang,
      previewSeconds,
    );

    if (!options.skipCache) {
      const cached = await redis.get<LessonPlaybackResult>(key);
      if (cached) return cached;
    }

    const result = await resolveLessonPlaybackUncached(
      snapshot,
      options.courseId,
      lang,
      previewSeconds,
    );

    if (result?.status === 'ready' && result.expiresInSeconds !== null) {
      const ex = playbackCacheTtl(
        result.expiresInSeconds,
        result.captionsPending === true,
      );
      await redis.set(key, JSON.stringify(result), { ex });
    }

    return result;
  },
  {
    /**
     * Evict a lesson's cached playback entries in EVERY course teaching it,
     * for EVERY version of it: the entries are keyed by both, and which
     * version a course was on when one was written is not recorded.
     * Unconditional — unlike the read path's TTL-bounded writes, the change
     * must invalidate regardless of whether an entry currently exists, so
     * callers never have to reason about whether one does.
     */
    invalidate: async (lessonSlug: string): Promise<void> => {
      const lessonId = await getLessonIdBySlug(lessonSlug);
      if (lessonId === null) return;
      const [courseIds, versions] = await Promise.all([
        getCourseIdsForLesson(lessonId),
        db
          .select({ id: lessonVersionsTable.id })
          .from(lessonVersionsTable)
          .where(eq(lessonVersionsTable.lessonId, lessonId)),
      ]);
      // Every language: the main video is also cached under each language the
      // version has no video in.
      const keys = courseIds.flatMap((courseId) =>
        versions.flatMap((version) =>
          ALL_LANGS.flatMap((lang) => [
            cacheKey(courseId, lessonSlug, version.id, lang),
            cacheKey(
              courseId,
              lessonSlug,
              version.id,
              lang,
              VIDEO_PREVIEW_SECONDS,
            ),
          ]),
        ),
      );
      // One request, not one per key; DEL with no key is an error.
      if (keys.length > 0) await redis.del(...keys);
    },
  },
);
