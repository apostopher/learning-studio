import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

import { db } from '../db';
import { claimPendingEnrolments } from '../db/pending-enrolments';
import { ensureUserProfile } from '../db/user-profile';
import { env } from '../env';
import { sendOtpEmail } from './email/send-otp-email';

/**
 * Production hosts this app is served from, beyond `baseURL` itself.
 *
 * `authClient` is created without a `baseURL` (see `auth-client.ts`), so the
 * browser posts to `/api/auth/*` on whatever host it is currently on and sends
 * that host as the `Origin`. Better Auth rejects any request whose origin is
 * neither `baseURL` nor listed here, and the symptom is a bare "invalid origin"
 * at sign-in with nothing wrong on the DNS or domain side to point at. Every
 * domain aliased to this deployment has to appear here until it *is*
 * `BETTER_AUTH_URL`.
 */
const PRODUCTION_TRUSTED_ORIGINS = ['https://itps.rmtpstudio.com'];

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Vite dev picks the first free port (5000 → 5001 → 5002), so the origin
  // won't always match BETTER_AUTH_URL. Trust any localhost port in dev only.
  trustedOrigins:
    process.env.NODE_ENV === 'development'
      ? ['http://localhost:*']
      : PRODUCTION_TRUSTED_ORIGINS,
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
            // Only after the profile exists: course_subscriptions.user_id
            // references it, so the order here is a foreign key, not a
            // preference. An admin who pre-assigned courses to this email
            // expects them to be there on the first page the person sees.
            const claimed = await claimPendingEnrolments({
              userId: user.id,
              email: user.email,
            });
            if (claimed > 0) {
              console.info(
                `Claimed ${claimed} pre-assigned course(s) for ${user.email}.`,
              );
            }
          } catch (error) {
            console.error(
              `Failed to set up account ${user.id}; the authenticated-request repair will retry.`,
              error,
            );
          }
        },
      },
    },
  },
});
