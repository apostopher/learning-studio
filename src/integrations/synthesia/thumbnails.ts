import { isVideoAvailable } from '../../types';
import { cacheWithRedis } from '../upstash/redis';
import { getVideoExpiry, getVideosByPage, SYNTHESIA_PAGE_SIZE } from './videos';

/**
 * Bounds the sweep at 1000 videos. A Synthesia account can hold far more than
 * one course's worth, and an unbounded loop on a board request is a hang
 * waiting to happen. Lessons past the cap simply get no poster.
 */
const MAX_PAGES = 10;

/** Never cache so briefly that the board re-sweeps on every load... */
const MIN_TTL_SECONDS = 5 * 60;
/** ...nor so long that a rotated credential keeps serving dead URLs all day. */
const MAX_TTL_SECONDS = 6 * 60 * 60;

/**
 * Every thumbnail URL Synthesia will hand out for this API key, as
 * `videoId → url`.
 *
 * One request per 100 videos rather than one per lesson: the list endpoint
 * already carries `thumbnail`, so a whole course costs one or two round trips.
 * Videos still rendering, and videos with no thumbnail, are absent — a missing
 * key is the caller's signal to fall back, not an error.
 */
export async function getVideoThumbnails(
  apiKey: string,
): Promise<Record<string, string>> {
  const thumbnails: Record<string, string> = {};

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { videos } = await getVideosByPage(page, apiKey);
    for (const video of videos) {
      if (!isVideoAvailable(video)) continue;
      if (video.thumbnail.image) thumbnails[video.id] = video.thumbnail.image;
    }
    // A short page is the last page. Checking length beats fetching one more
    // page to discover it is empty.
    if (videos.length < SYNTHESIA_PAGE_SIZE) return thumbnails;
  }

  console.warn(
    `Synthesia thumbnail sweep stopped at the ${MAX_PAGES}-page cap; lessons beyond it get no poster.`,
  );
  return thumbnails;
}

/**
 * Computes the Redis cache TTL for a thumbnail map, following the URLs'
 * pre-signed `Expires` timestamps.
 *
 * Clamped at both ends: Redis rejects a non-positive TTL, and an
 * already-expired URL would otherwise compute one.
 *
 * @param thumbnails Video ID → thumbnail URL mapping
 * @returns Seconds to cache (clamped to [MIN_TTL_SECONDS, MAX_TTL_SECONDS])
 */
export function computeThumbnailCacheTTL(
  thumbnails: Record<string, string>,
): number {
  const expiries = Object.values(thumbnails)
    .map((url) => getVideoExpiry(url))
    .filter((seconds): seconds is number => seconds !== null);
  if (expiries.length === 0) return MAX_TTL_SECONDS;
  return Math.min(
    MAX_TTL_SECONDS,
    Math.max(MIN_TTL_SECONDS, Math.min(...expiries)),
  );
}

/**
 * Cached per course, so a board reload does not re-sweep Synthesia.
 *
 * The TTL follows the thumbnails themselves: their URLs are pre-signed and
 * carry an `Expires`, so caching past it would serve URLs that 403. Clamped at
 * both ends — Redis rejects a non-positive TTL, and an already-expired URL
 * would otherwise compute one.
 */
export const getVideoThumbnailsWithCache = cacheWithRedis<
  { courseId: number; apiKey: string },
  Record<string, string>
>(
  'synthesia-thumbnails',
  ({ apiKey }) => getVideoThumbnails(apiKey),
  computeThumbnailCacheTTL,
  // Keyed on the course alone. The API key must never reach a Redis key.
  ({ courseId }) => String(courseId),
);
