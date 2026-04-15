import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { mcp } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { db } from '../db'
import { env } from '../env'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    tanstackStartCookies(),
    mcp({
      loginPage: '/login',
      resource: env.MCP_RESOURCE_URL,
    }),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
})
