import { getCourseDetailsWithCache } from '#/db/course';

/**
 * Evict the learner-facing `getCourseDetailsWithCache` entry for a course so
 * an admin save is visible immediately instead of waiting out the 6h TTL.
 *
 * Best-effort, same pattern as `deleteBlobs`/`deleteOrphanedBlob` elsewhere:
 * a Redis outage must not turn a successful admin write into a failed
 * response, so failures are logged and swallowed rather than thrown. `slug`
 * is `null` when the owning course couldn't be resolved (e.g. a dangling
 * id) — nothing to invalidate in that case.
 *
 * Lives in its own module (not `#/db/admin`) so `#/db/placements` can import
 * it without depending on all of `admin.ts` — which itself imports
 * `#/db/course`, and later tasks make `admin.ts` import `placements.ts` too.
 */
export async function invalidateCourseDetailsCache(
  slug: string | null,
): Promise<void> {
  if (!slug) return;
  try {
    await getCourseDetailsWithCache.invalidate(slug);
  } catch (error) {
    console.error('Failed to invalidate course-details cache:', error);
  }
}
