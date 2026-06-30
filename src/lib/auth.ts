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
