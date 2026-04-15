import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createFileRoute } from '@tanstack/react-router'
import { withMcpAuth } from 'better-auth/plugins'
import { randomUUID } from 'node:crypto'

import { env } from '#/env'
import { auth } from '#/lib/auth'
import { corsHeaders, preflightResponse, withCors } from '#/lib/mcp/cors'
import { RedisEventStore } from '#/lib/mcp/event-store'
import { createMcpServer } from '#/lib/mcp/server-factory'
import { sessionStore } from '#/lib/mcp/session-store'

import type { OAuthAccessToken } from 'better-auth/plugins'

const eventStore = new RedisEventStore()

const SESSION_HEADER = 'mcp-session-id'

function parseScopes(scopes: string | string[] | undefined): string[] {
  if (!scopes) return []
  if (Array.isArray(scopes)) return scopes
  return scopes.split(/\s+/).filter(Boolean)
}

function unauthorizedResponse(request: Request, detail?: string): Response {
  const resourceMetadata = new URL(
    '/.well-known/oauth-protected-resource',
    env.BETTER_AUTH_URL,
  ).toString()
  const body = {
    jsonrpc: '2.0' as const,
    error: {
      code: -32001,
      message: detail ?? 'Unauthorized',
    },
    id: null,
  }
  return withCors(
    new Response(JSON.stringify(body), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${resourceMetadata}"`,
      },
    }),
    request,
  )
}

async function getOrCreateSession(
  request: Request,
  session: OAuthAccessToken,
): Promise<{
  transport: WebStandardStreamableHTTPServerTransport
  sessionId?: string
} | null> {
  const sessionId = request.headers.get(SESSION_HEADER) ?? undefined

  if (sessionId) {
    const existing = sessionStore.get(sessionId)
    if (!existing) {
      const knownRemote = await sessionStore.exists(sessionId)
      if (!knownRemote) return null
      return null
    }
    if (existing.userId !== session.userId) return null
    await sessionStore.touch(sessionId)
    return { transport: existing.transport, sessionId }
  }

  const scopes = parseScopes(session.scopes)
  const server = createMcpServer({ userId: session.userId, scopes })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    eventStore,
    onsessioninitialized: async (id) => {
      await sessionStore.register(id, {
        transport,
        server,
        userId: session.userId,
      })
    },
    onsessionclosed: async (id) => {
      await sessionStore.remove(id)
    },
  })

  await server.connect(transport)
  return { transport, sessionId: undefined }
}

async function handle(request: Request, session: OAuthAccessToken): Promise<Response> {
  const method = request.method.toUpperCase()

  if (method === 'POST') {
    let parsedBody: unknown
    try {
      parsedBody = await request.json()
    } catch {
      return withCors(
        Response.json(
          {
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: Invalid JSON' },
            id: null,
          },
          { status: 400 },
        ),
        request,
      )
    }

    const ctx = await getOrCreateSession(request, session)
    if (!ctx) {
      return withCors(
        Response.json(
          {
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null,
          },
          { status: 404 },
        ),
        request,
      )
    }

    const response = await ctx.transport.handleRequest(request, {
      parsedBody,
      authInfo: {
        token: session.accessToken,
        clientId: session.clientId,
        scopes: parseScopes(session.scopes),
        extra: { userId: session.userId },
      },
    })
    return withCors(response, request)
  }

  if (method === 'GET' || method === 'DELETE') {
    const sessionId = request.headers.get(SESSION_HEADER)
    if (!sessionId) {
      return withCors(
        new Response('Missing Mcp-Session-Id', { status: 400 }),
        request,
      )
    }
    const existing = sessionStore.get(sessionId)
    if (!existing || existing.userId !== session.userId) {
      return withCors(new Response('Session not found', { status: 404 }), request)
    }
    await sessionStore.touch(sessionId)
    const response = await existing.transport.handleRequest(request, {
      authInfo: {
        token: session.accessToken,
        clientId: session.clientId,
        scopes: parseScopes(session.scopes),
        extra: { userId: session.userId },
      },
    })
    return withCors(response, request)
  }

  return withCors(
    new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, POST, DELETE, OPTIONS' },
    }),
    request,
  )
}

const authedHandler = withMcpAuth(auth, handle)

async function dispatch(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflightResponse(request)

  try {
    const response = await authedHandler(request)
    if (response.status === 401) return unauthorizedResponse(request)
    return response
  } catch (error) {
    console.error('MCP route error:', error)
    const body = {
      jsonrpc: '2.0' as const,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: error instanceof Error ? error.message : String(error),
      },
      id: null,
    }
    return withCors(
      new Response(JSON.stringify(body), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      }),
      request,
    )
  }
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => dispatch(request),
      POST: ({ request }) => dispatch(request),
      DELETE: ({ request }) => dispatch(request),
      OPTIONS: ({ request }) => dispatch(request),
    },
  },
})
