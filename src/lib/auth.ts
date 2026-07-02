import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, mcp } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "../db";
import { env } from "../env";
import { sendOtpEmail } from "./email/send-otp-email";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Vite dev picks the first free port (5000 → 5001 → 5002), so the origin
  // won't always match BETTER_AUTH_URL. Trust any localhost port in dev only.
  trustedOrigins:
    process.env.NODE_ENV === "development" ? ["http://localhost:*"] : [],
  plugins: [
    tanstackStartCookies(),
    emailOTP({
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[DEV] OTP for ${email} (${type}): ${otp}`);
          return;
        }
        await sendOtpEmail({ email, otp, type });
      },
    }),
    mcp({
      loginPage: "/auth/login",
      resource: env.MCP_RESOURCE_URL,
    }),
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
});
