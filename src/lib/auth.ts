import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { mcp } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "../db";
import { env } from "../env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  plugins: [
    tanstackStartCookies(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "sign-in") {
          // Send the OTP for sign in
        } else if (type === "email-verification") {
          // Send the OTP for email verification
        } else {
          // Send the OTP for password reset
        }
      },
    }),
    mcp({
      loginPage: "/login",
      resource: env.MCP_RESOURCE_URL,
    }),
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
});
