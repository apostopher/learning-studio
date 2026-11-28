import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { getUserRoleNames } from '#/db/admin';
import { isAnyCourseStaff } from '#/db/course-staff';
import { offeringUsersTable } from '#/db/schema';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * Whether the user may use Viper: the chat bubble, its video call, and the
 * onboarding interview. Viper is a paid feature (user, 2026-11-28).
 *
 * Refused only to someone on the schedule with no paid seat anywhere: every
 * seat they hold is FREE. Anyone with one paid seat keeps Viper everywhere;
 * so do admins, owners and course staff, who use it to author and check.
 * Someone on no offering at all is not a free student, and is not refused
 * here (they have no course to use it in anyway).
 */
export async function hasViperAccess(userId: string): Promise<boolean> {
  const [roles, isStaff, seats] = await Promise.all([
    getUserRoleNames(userId),
    isAnyCourseStaff(userId),
    db
      .selectDistinct({ plan: offeringUsersTable.plan })
      .from(offeringUsersTable)
      .where(eq(offeringUsersTable.userId, userId)),
  ]);
  if (hasAdminAccess(roles) || isStaff) return true;
  return viperAllowedForSeats(seats.map((seat) => seat.plan));
}

/** The seat half of the rule, pure: no seats, or any paid seat, allows. */
export function viperAllowedForSeats(plans: readonly string[]): boolean {
  return plans.length === 0 || plans.includes('paid');
}

/** The one refusal every Viper endpoint sends a free user. */
export const viperRefusal = () =>
  Response.json(
    { error: 'Viper is part of the paid plan.', code: 'VIPER_NOT_IN_PLAN' },
    { status: 403 },
  );
