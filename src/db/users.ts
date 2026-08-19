import { and, asc, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseSubscriptionsTable,
  coursesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { ensureEnrolmentLevel } from '#/db/user-levels';
import type { UpdateUserProfileInput } from '#/lib/admin-schemas';

export type AdminUser = {
  profileId: number;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  callSign: string | null;
  phoneNumber: string | null;
  roles: string[];
  courses: { id: number; name: string }[];
  createdAt: Date;
};

/**
 * Every account with its roles and course entitlements.
 *
 * Three queries rather than one join: a user × roles × courses join multiplies
 * rows and needs de-duplicating in JS anyway, and at this scale (single-digit
 * users) the round trips are cheaper than the cartesian product.
 */
export async function listUsers(): Promise<AdminUser[]> {
  const profiles = await db
    .select({
      profileId: userProfileTable.id,
      userId: userProfileTable.userId,
      email: userProfileTable.email,
      firstName: userProfileTable.firstName,
      lastName: userProfileTable.lastName,
      callSign: userProfileTable.callSign,
      phoneNumber: userProfileTable.phoneNumber,
      createdAt: userProfileTable.createdAt,
    })
    .from(userProfileTable)
    .orderBy(asc(userProfileTable.email));

  const roleRows = await db
    .select({
      profileId: userProfileRolesTable.userProfileId,
      name: userRolesTable.name,
    })
    .from(userProfileRolesTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    );

  const courseRows = await db
    .select({
      userId: courseSubscriptionsTable.userId,
      courseId: coursesTable.id,
      courseName: coursesTable.name,
    })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .orderBy(asc(coursesTable.name));

  const rolesByProfile = new Map<number, string[]>();
  for (const row of roleRows) {
    const list = rolesByProfile.get(row.profileId) ?? [];
    list.push(row.name);
    rolesByProfile.set(row.profileId, list);
  }

  const coursesByUser = new Map<string, { id: number; name: string }[]>();
  for (const row of courseRows) {
    const list = coursesByUser.get(row.userId) ?? [];
    list.push({ id: row.courseId, name: row.courseName });
    coursesByUser.set(row.userId, list);
  }

  return profiles.map((p) => ({
    ...p,
    roles: rolesByProfile.get(p.profileId) ?? [],
    courses: coursesByUser.get(p.userId) ?? [],
  }));
}

export async function getUserProfile(profileId: number): Promise<{
  profileId: number;
  userId: string;
  email: string;
} | null> {
  const [row] = await db
    .select({
      profileId: userProfileTable.id,
      userId: userProfileTable.userId,
      email: userProfileTable.email,
    })
    .from(userProfileTable)
    .where(eq(userProfileTable.id, profileId))
    .limit(1);
  return row ?? null;
}

/**
 * Update a profile's editable fields.
 *
 * `email` and `associateNumber` are deliberately not updatable: the profile
 * email is a separate column from the auth record that actually governs
 * sign-in, so editing it here only creates drift, and associate numbers come
 * from a counter rather than free text.
 */
export async function updateUserProfile(
  profileId: number,
  input: UpdateUserProfileInput,
): Promise<boolean> {
  const updated = await db
    .update(userProfileTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(userProfileTable.id, profileId))
    .returning({ id: userProfileTable.id });
  return updated.length > 0;
}

/** Grant a course to an existing account. */
export async function addUserEnrolment(options: {
  userId: string;
  courseId: number;
  grantedBy: string;
}): Promise<void> {
  await db
    .insert(courseSubscriptionsTable)
    .values({
      userId: options.userId,
      courseId: options.courseId,
      grantedBy: options.grantedBy,
    })
    .onConflictDoNothing({
      target: [
        courseSubscriptionsTable.userId,
        courseSubscriptionsTable.courseId,
      ],
    });
  // A pilot with an entitlement but no level row renders an empty course with
  // no error anywhere, so the level row is part of enrolling, not a side task.
  await ensureEnrolmentLevel(options.userId, options.courseId);
}

/**
 * Revoke a course.
 *
 * Removes the entitlement row and nothing else: progress, onboarding answers
 * and the SKA profile all survive, so re-granting resumes where the learner
 * left off. Unassigning is an access decision, not a request to erase someone's
 * work — and the destructive version would be unrecoverable.
 */
export async function removeUserEnrolment(
  userId: string,
  courseId: number,
): Promise<void> {
  await db
    .delete(courseSubscriptionsTable)
    .where(
      and(
        eq(courseSubscriptionsTable.userId, userId),
        eq(courseSubscriptionsTable.courseId, courseId),
      ),
    );
}
