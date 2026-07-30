// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL/TOKEN at module load time —
// stub the client so this test doesn't depend on real credentials being
// present in the environment.
const redisClient = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => redisClient },
}));

const { cacheWithRedis } = await import('#/integrations/upstash/redis');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cacheWithRedis / invalidate', () => {
  it('invalidate deletes the exact key a read/write would use for the same args', async () => {
    const fn = vi.fn().mockResolvedValue({ slug: 'flight-basics' });
    const cached = cacheWithRedis('course-details', fn);

    redisClient.get.mockResolvedValue(null);
    await cached('flight-basics');
    // The key format is `${keyPrefix}${CACHE_KEY_SEPARATOR}${JSON.stringify(args)}`
    // for a plain string arg — i.e. the string arrives JSON-quoted.
    expect(redisClient.get).toHaveBeenCalledWith(
      'course-details:"flight-basics"',
    );
    expect(redisClient.set).toHaveBeenCalledWith(
      'course-details:"flight-basics"',
      expect.any(String),
      expect.objectContaining({ ex: expect.any(Number) }),
    );

    await cached.invalidate('flight-basics');

    expect(redisClient.del).toHaveBeenCalledWith(
      'course-details:"flight-basics"',
    );
  });

  it('invalidate only clears the entry for its own args, not a different course', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    const cached = cacheWithRedis('course-details', fn);

    await cached.invalidate('flight-basics');

    expect(redisClient.del).toHaveBeenCalledWith(
      'course-details:"flight-basics"',
    );
    expect(redisClient.del).not.toHaveBeenCalledWith(
      expect.stringContaining('other-course'),
    );
  });

  it('a subsequent read after invalidate misses the cache and calls fn again', async () => {
    const fn = vi.fn().mockResolvedValue({ v: 1 });
    const cached = cacheWithRedis('course-details', fn);

    redisClient.get.mockResolvedValueOnce(null);
    await cached('flight-basics');
    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate a hit before invalidation.
    redisClient.get.mockResolvedValueOnce({ v: 1 });
    await cached('flight-basics');
    expect(fn).toHaveBeenCalledTimes(1); // still 1 — served from cache

    await cached.invalidate('flight-basics');

    redisClient.get.mockResolvedValueOnce(null); // del actually cleared it
    await cached('flight-basics');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
