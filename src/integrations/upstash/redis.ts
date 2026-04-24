import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

export const redis = Redis.fromEnv();

const CACHE_EXPIRY_SECONDS = 60 * 60 * 6; // 6 hours
export const CACHE_KEY_SEPARATOR = ":";

export const cacheWithRedis = <T, R>(
  keyPrefix: string,
  fn: (args: T) => Promise<R>,
  expiresExtractor: (result: R) => number | null = () => CACHE_EXPIRY_SECONDS,
  keyGenerator?: (args: T) => string,
): ((args: T) => Promise<R>) => {
  return async (args): Promise<R> => {
    let key: string;
    if (keyGenerator) {
      key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${keyGenerator(args)}`;
    } else if (args) {
      // For arrays, create a hash of the content instead of full JSON stringify
      if (Array.isArray(args)) {
        const hash = args
          .map((item, index) => {
            if (typeof item === "object" && item !== null) {
              // For objects, use a combination of keys and values
              return `${index}:${Object.keys(item)
                .sort()
                .join(",")}:${Object.values(item).join(",")}`;
            }
            return `${index}:${item}`;
          })
          .join("|");
        key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${hash}`;
      } else {
        key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${JSON.stringify(args)}`;
      }
    } else {
      key = keyPrefix;
    }

    // Limit key length to prevent Redis issues
    if (key.length > 500) {
      const hash = createHash("md5").update(key).digest("hex");
      key = `${keyPrefix}${CACHE_KEY_SEPARATOR}${hash}`;
    }

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
  };
};
