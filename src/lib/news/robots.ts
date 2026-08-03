import robotsParser from 'robots-parser';
import { cacheGet, cacheSet } from './cache';

/** Matches the `user-agent` sent by `fetchPage`. */
export const ROBOTS_USER_AGENT = 'RMTPStudioNewsBot';

const CACHE_PREFIX = 'news:robots';
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const ROBOTS_TIMEOUT_MS = 8_000;

/** One robots.txt per origin per day, not per URL. */
const cacheKey = (origin: string) => `${CACHE_PREFIX}:${origin}`;

async function loadRobotsTxt(origin: string): Promise<string | null> {
  const cached = await cacheGet<string>(cacheKey(origin));
  if (typeof cached === 'string') return cached === '' ? null : cached;

  let body = '';
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      headers: { 'user-agent': ROBOTS_USER_AGENT },
    });
    // 404 is the common case and means "no restrictions". A 5xx means the
    // server is unwell, not that it forbids us — both are treated as absent,
    // and the empty-string cache stops us re-asking a broken host all day.
    body = res.ok ? await res.text() : '';
  } catch {
    body = '';
  }

  await cacheSet(cacheKey(origin), body, CACHE_TTL_SECONDS);
  return body === '' ? null : body;
}

/**
 * Whether we may crawl `url`.
 *
 * Fails **open**: a missing, unreachable or unparseable robots.txt permits
 * crawling, which is what the standard intends — absence of a policy is not a
 * prohibition. Only an explicit `Disallow` matching our user-agent blocks.
 */
export async function isCrawlAllowed(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const body = await loadRobotsTxt(parsed.origin);
  if (body === null) return true;

  try {
    const robots = robotsParser(`${parsed.origin}/robots.txt`, body);
    // `isAllowed` returns undefined when it has no opinion — treat as allowed.
    return robots.isAllowed(url, ROBOTS_USER_AGENT) !== false;
  } catch {
    return true;
  }
}
