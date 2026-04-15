import { redis } from '#/lib/redis'

import type { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface SessionHandle {
  transport: WebStandardStreamableHTTPServerTransport
  server: McpServer
  userId: string
}

const SESSION_TTL_SECONDS = 60 * 60 * 8
const sessionKey = (id: string) => `mcp:session:${id}`

const localSessions = new Map<string, SessionHandle>()

export const sessionStore = {
  async register(sessionId: string, handle: SessionHandle): Promise<void> {
    localSessions.set(sessionId, handle)
    await redis.set(
      sessionKey(sessionId),
      JSON.stringify({ userId: handle.userId, createdAt: Date.now() }),
      'EX',
      SESSION_TTL_SECONDS,
    )
  },

  async touch(sessionId: string): Promise<void> {
    await redis.expire(sessionKey(sessionId), SESSION_TTL_SECONDS)
  },

  get(sessionId: string): SessionHandle | undefined {
    return localSessions.get(sessionId)
  },

  async exists(sessionId: string): Promise<boolean> {
    if (localSessions.has(sessionId)) return true
    return (await redis.exists(sessionKey(sessionId))) === 1
  },

  async remove(sessionId: string): Promise<void> {
    const handle = localSessions.get(sessionId)
    localSessions.delete(sessionId)
    await redis.del(sessionKey(sessionId))
    if (handle) {
      try {
        await handle.transport.close()
      } catch {
        // transport already closed
      }
      try {
        await handle.server.close()
      } catch {
        // server already closed
      }
    }
  },
}
