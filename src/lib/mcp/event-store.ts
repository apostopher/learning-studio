import { randomUUID } from 'node:crypto'

import type {
  EventStore,
  EventId,
  StreamId,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

import { redis } from '#/lib/redis'

const EVENT_TTL_SECONDS = 60 * 15
const MAX_EVENTS_PER_STREAM = 1000

const streamKey = (streamId: StreamId) => `mcp:events:stream:${streamId}`
const eventKey = (eventId: EventId) => `mcp:events:event:${eventId}`

interface StoredEvent {
  streamId: StreamId
  message: JSONRPCMessage
  index: number
}

export class RedisEventStore implements EventStore {
  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage,
  ): Promise<EventId> {
    const eventId = randomUUID()
    const index = await redis.incr(`${streamKey(streamId)}:counter`)
    await redis.expire(`${streamKey(streamId)}:counter`, EVENT_TTL_SECONDS)

    const payload: StoredEvent = { streamId, message, index }
    const serialized = JSON.stringify(payload)

    const pipeline = redis.pipeline()
    pipeline.set(eventKey(eventId), serialized, 'EX', EVENT_TTL_SECONDS)
    pipeline.zadd(streamKey(streamId), index, eventId)
    pipeline.expire(streamKey(streamId), EVENT_TTL_SECONDS)
    pipeline.zremrangebyrank(streamKey(streamId), 0, -MAX_EVENTS_PER_STREAM - 1)
    await pipeline.exec()

    return eventId
  }

  async getStreamIdForEventId(
    eventId: EventId,
  ): Promise<StreamId | undefined> {
    const raw = await redis.get(eventKey(eventId))
    if (!raw) return undefined
    return (JSON.parse(raw) as StoredEvent).streamId
  }

  async replayEventsAfter(
    lastEventId: EventId,
    {
      send,
    }: {
      send: (eventId: EventId, message: JSONRPCMessage) => Promise<void>
    },
  ): Promise<StreamId> {
    const raw = await redis.get(eventKey(lastEventId))
    if (!raw) {
      throw new Error(`Unknown lastEventId: ${lastEventId}`)
    }
    const { streamId, index: lastIndex } = JSON.parse(raw) as StoredEvent

    const eventIds = await redis.zrangebyscore(
      streamKey(streamId),
      `(${lastIndex}`,
      '+inf',
    )

    if (eventIds.length === 0) return streamId

    const payloads = await redis.mget(eventIds.map(eventKey))
    for (let i = 0; i < eventIds.length; i++) {
      const payload = payloads[i]
      if (!payload) continue
      const stored = JSON.parse(payload) as StoredEvent
      await send(eventIds[i], stored.message)
    }

    return streamId
  }
}
