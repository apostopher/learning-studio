import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

import { db } from '../db';
import { ensureUserProfile } from '../db/user-profile';
import { env } from '../env';
import { sendOtpEmail } from './email/send-otp-email';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Vite dev picks the first free port (5000 → 5001 → 5002), so the origin
  // won't always match BETTER_AUTH_URL. Trust any localhost port in dev only.
  trustedOrigins:
    process.env.NODE_ENV === 'development' ? ['http://localhost:*'] : [],
  plugins: [
    tanstackStartCookies(),
    emailOTP({
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEV] OTP for ${email} (${type}): ${otp}`);
          return;
        }
        await sendOtpEmail({ email, otp, type });
      },
    }),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  databaseHooks: {
    user: {
      create: {
        /**
         * Give every new account its `user_profiles` row. Thirteen tables
         * have a foreign key onto it, so without this the account can sign in
         * and then fail every write it attempts — see `ensureUserProfile`.
         *
         * Failures are logged and swallowed rather than rethrown. This hook is
         * NOT transactional with the `user` row: by the time it runs the
         * account is already committed, and `email` is unique, so rethrowing
         * would leave a person unable to sign up again *and* unable to be
         * repaired — the `after` hook never fires a second time. Letting the
         * signup succeed hands the problem to the idempotent repair on the
         * authenticated request path, which fixes it on the next page load.
         */
        after: async (user) => {
          try {
            await ensureUserProfile(user.id, user.email);
          } catch (error) {
            console.error(
              `Failed to create user profile for ${user.id}; the authenticated-request repair will retry.`,
              error,
            );
          }
        },
      },
    },
  },
});
