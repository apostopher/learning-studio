import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

export const redis = Redis.fromEnv();

const CACHE_EXPIRY_SECONDS = 60 * 60 * 6; // 6 hours
export const CACHE_KEY_SEPARATOR = ':';

/**
 * A cached reader that also exposes `.invalidate(args)` so a mutation that
 * changes what `fn` would return can evict the stale entry instead of
 * waiting out the TTL. `.invalidate` rebuilds the key with the exact same
 * logic used for reads/writes, so callers never hand-assemble key strings.
 */
export type CachedFn<T, R> = ((args: T) => Promise<R>) & {
  invalidate: (args: T) => Promise<void>;
};

export const cacheWithRedis = <T, R>(
  keyPrefix: string,
  fn: (args: T) => Promise<R>,
  expiresExtractor: (result: R) => number | null = () => CACHE_EXPIRY_SECONDS,
  keyGenerator?: (args: T) => string,
): CachedFn<T, R> => {
  const buildKey = (args: T): string => {
    let key: string;
    if (keyGenerator) {
      key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${keyGenerator(args)}`;
    } else if (args) {
      // For arrays, create a hash of the content instead of full JSON stringify
      if (Array.isArray(args)) {
        const hash = args
          .map((item, index) => {
            if (typeof item === 'object' && item !== null) {
              // For objects, use a combination of keys and values
              return `${index}:${Object.keys(item)
                .sort()
                .join(',')}:${Object.values(item).join(',')}`;
            }
            return `${index}:${item}`;
          })
          .join('|');
        key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${hash}`;
      } else {
        key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${JSON.stringify(args)}`;
      }
    } else {
      key = keyPrefix;
    }

    // Limit key length to prevent Redis issues
    if (key.length > 500) {
      const hash = createHash('md5').update(key).digest('hex');
      key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${hash}`;
    }

    return key;
  };

  const cached = (async (args): Promise<R> => {
    const key = buildKey(args);

    const cachedResult = await redis.get<R>(key);
    if (cachedResult) {
      console.log(`Cache hit for ${key}`);
      return cachedResult;
    }

    const result = await fn(args);
    const expires = expiresExtractor(result) ?? CACHE_EXPIRY_SECONDS;
    await redis.set(key, JSON.stringify(result), {
      ex: expires,
    });
    return result;
  }) as CachedFn<T, R>;

  cached.invalidate = async (args: T): Promise<void> => {
    const key = buildKey(args);
    await redis.del(key);
  };

  return cached;
};
