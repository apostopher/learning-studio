import { env } from '#/env'

const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS'
const ALLOWED_HEADERS =
  'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
const EXPOSED_HEADERS = 'Mcp-Session-Id, WWW-Authenticate'

function isAllowedOrigin(origin: string): boolean {
  if (env.MCP_CORS_ALLOWLIST.length === 0) return false
  if (env.MCP_CORS_ALLOWLIST.includes('*')) return true
  return env.MCP_CORS_ALLOWLIST.includes(origin)
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return headers
}

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    headers.set(k, v)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
