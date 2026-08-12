import { createHash } from 'node:crypto';
import { deriveKeyPoints } from '#/ai/derive-key-points';
import { redis } from '#/integrations/upstash/redis';

const CACHE_KEY_PREFIX = 'derived-key-points';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Keyed by a hash of the TEXT, not by lesson slug.
 *
 * Derivation is a pure function of its input, so the hash is the honest cache
 * key — and it invalidates itself for free: an admin who rewrites a lesson's
 * body text, or a video re-render that changes the captions, produces a
 * different hash and therefore a fresh derivation. A slug-keyed entry would
 * keep serving key points for text that no longer exists.
 */
function cacheKey(text: string): string {
  const digest = createHash('sha1').update(text).digest('hex').slice(0, 16);
  return `${CACHE_KEY_PREFIX}:${digest}`;
}

/**
 * Key points for a body of lesson text, derived once and remembered.
 *
 * Empty array when derivation fails — callers treat that as "no debrief from
 * this source" and fall through. Failures are never cached.
 */
export async function getDerivedKeyPoints(text: string): Promise<string[]> {
  const key = cacheKey(text);
  const cached = await redis.get<string[]>(key);
  if (cached?.length) return cached;

  let keyPoints: string[];
  try {
    keyPoints = await deriveKeyPoints(text);
  } catch (error) {
    console.error('Failed to derive key points:', error);
    return [];
  }
  if (keyPoints.length === 0) return [];

  await redis.set(key, JSON.stringify(keyPoints), { ex: CACHE_TTL_SECONDS });
  return keyPoints;
}
