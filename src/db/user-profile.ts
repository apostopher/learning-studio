import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { userProfileTable } from '#/db/schema';

/**
 * Create this account's `user_profiles` row if it doesn't already have one.
 *
 * Every piece of learner state hangs off this row: thirteen tables carry a
 * foreign key onto `user_profiles.user_id` — course_subscriptions, ai_chats,
 * lesson_material_progress, videos_progress, lesson_quiz_answers,
 * lesson_test_results, course_onboarding, user_ska_profile, fav_key_points,
 * course_last_viewed, user_news_sources, user_organizations and
 * account_deletion_requests. Without it an account can authenticate and then
 * fail *every* write it attempts, which is what was happening to any signup
 * that wasn't created by hand with `db:grant-role`.
 *
 * Only `userId` and `email` are set. Nothing else is derivable at signup:
 * email-OTP writes `name: ''` and `image: null` on the auth record, and
 * `associateNumber` has no generator anywhere in the codebase — inventing one
 * here would be shipping an unrequested feature.
 *
 * Idempotent by design, because it is called from two places: the sign-in hook
 * (the normal path) and the authenticated request path (the repair). The
 * pre-read keeps the common case a single cheap SELECT rather than a write on
 * every page load; the untargeted `onConflictDoNothing` covers the race
 * between two concurrent first requests, and also the case where a row already
 * exists under this *email* with a different user id.
 */
export async function ensureUserProfile(
  userId: string,
  email: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: userProfileTable.id })
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId))
    .limit(1);
  if (existing) return;

  await db
    .insert(userProfileTable)
    .values({ userId, email })
    .onConflictDoNothing();
}

/** This account's email, or `null` if it has no profile row. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: userProfileTable.email })
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId))
    .limit(1);
  return row?.email ?? null;
}
