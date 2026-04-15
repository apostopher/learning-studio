import Redis, { type RedisOptions } from 'ioredis'

import { env } from '#/env'

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis | undefined
}

const options: RedisOptions = {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  enableAutoPipelining: true,
}

export const redis: Redis =
  globalThis.__redis__ ?? new Redis(env.REDIS_URL, options)

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis__ = redis
}
