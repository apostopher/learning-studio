import { redis } from '#/integrations/upstash/redis';

/**
 * Best-effort cache access for the scrape pipeline.
 *
 * Everything Redis holds here is an optimization — a robots.txt verdict and a
 * fetched index page, both re-derivable. Letting a cache error propagate trades
 * a slower run for NO run: an unreachable Redis previously threw on the first
 * `get` inside `isCrawlAllowed`, before any source had been fetched, and every
 * source failed identically with a message about a URL nobody in this codebase
 * had constructed.
 *
 * So: a cache miss and a cache failure are the same thing to a caller here.
 */

let warned = false;

/** Warn once per process — 14 sources × 2 calls would otherwise bury the log. */
function warnOnce(operation: string, error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(
    `[news] cache unavailable (${operation}); continuing without it. Every page will be re-fetched until it returns. ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key);
  } catch (error) {
    warnOnce('read', error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    warnOnce('write', error);
  }
}
