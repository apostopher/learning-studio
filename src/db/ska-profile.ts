import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { normaliseSkaProfile } from '#/lib/ska-profile';
import type { SkaProfile } from '#/types';
import { db } from '#/db';
import { type UserSkaProfileSelect, userSkaProfileTable } from '#/db/schema';

/**
 * Writes a freshly generated profile, unreviewed.
 *
 * `onConflictDoNothing` rather than an upsert, and that asymmetry is the
 * point: a retried turn must not overwrite a profile the user has already
 * edited. Generation happens exactly once per (user, course) — the ONLY other
 * writer is the user's own save. Nothing in this codebase regenerates, and
 * this is where that promise is kept.
 *
 * Returns the row that ended up in the table (the insert's, or the existing
 * one), so a caller that lost the race still renders the real profile rather
 * than nothing.
 */
export const createSkaProfile = async ({
  userId,
  courseId,
  profile,
}: {
  userId: string;
  courseId: number;
  profile: SkaProfile;
}): Promise<UserSkaProfileSelect> => {
  const normalised = normaliseSkaProfile(profile);

  const [inserted] = await db
    .insert(userSkaProfileTable)
    .values({ userId, courseId, ...normalised })
    .onConflictDoNothing({
      target: [userSkaProfileTable.userId, userSkaProfileTable.courseId],
    })
    .returning();

  if (inserted) return inserted;

  const existing = await findSkaProfile({ userId, courseId });
  if (!existing) {
    throw new Error(
      `createSkaProfile: insert conflicted but no row found for user ${userId}, course ${courseId}`,
    );
  }

  return existing;
};

/** The profile for one user and course, reviewed or not. Null when there is
 * none — a permanently legitimate state, never an error. */
export const findSkaProfile = async ({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}): Promise<UserSkaProfileSelect | null> => {
  const [row] = await db
    .select()
    .from(userSkaProfileTable)
    .where(
      and(
        eq(userSkaProfileTable.userId, userId),
        eq(userSkaProfileTable.courseId, courseId),
      ),
    );

  return row ?? null;
};

/**
 * The profile to inject into viper7 for a course — reviewed ONLY.
 *
 * The `reviewedAt` filter lives here, in the read, rather than at each call
 * site. An unreviewed profile that reaches a prompt is the one failure this
 * feature must not have, and a filter that every caller has to remember is a
 * filter that one caller eventually forgets.
 */
export const findReviewedSkaProfile = async ({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}): Promise<UserSkaProfileSelect | null> => {
  const [row] = await db
    .select()
    .from(userSkaProfileTable)
    .where(
      and(
        eq(userSkaProfileTable.userId, userId),
        eq(userSkaProfileTable.courseId, courseId),
        isNotNull(userSkaProfileTable.reviewedAt),
      ),
    );

  return row ?? null;
};

/**
 * The user's most-recently-updated REVIEWED profile, across every course.
 *
 * Used only where there is no course in context (the widget on `/app`), and
 * only its `attitude` is injected there — Skills and Knowledge are
 * course-specific and would answer a question about one course using another
 * course's material.
 *
 * Ordering by `updatedAt` gives edits precedence for free: a hand-edited
 * attitude is by definition the most recently updated one, so the user's own
 * words win over a generated profile from another course without any
 * precedence rule needing to be written down.
 */
export const findLatestReviewedSkaProfile = async ({
  userId,
}: {
  userId: string;
}): Promise<UserSkaProfileSelect | null> => {
  const [row] = await db
    .select()
    .from(userSkaProfileTable)
    .where(
      and(
        eq(userSkaProfileTable.userId, userId),
        isNotNull(userSkaProfileTable.reviewedAt),
      ),
    )
    .orderBy(desc(userSkaProfileTable.updatedAt))
    .limit(1);

  return row ?? null;
};

/**
 * Saves the user's edits AND marks the profile reviewed, in one statement.
 *
 * One write, not two, deliberately: these are the same user action (one
 * button), and splitting them creates a state — edited but unreviewed — that
 * the UI has no way to represent and that would silently keep a profile the
 * user just confirmed out of every prompt.
 *
 * `reviewedAt` is set unconditionally, not only when the text changed. The
 * user who reads their profile, agrees with all of it, and presses the button
 * has reviewed it; requiring a diff would permanently unpersonalise exactly
 * the people for whom generation worked best.
 *
 * Returns null when no row matched, which the route turns into a 404 — that
 * only happens if the profile was deleted between load and save (a withdrawal
 * in another tab), and silently re-creating it would resurrect data the user
 * just asked to erase.
 */
export const saveSkaProfileReview = async ({
  userId,
  courseId,
  profile,
}: {
  userId: string;
  courseId: number;
  profile: SkaProfile;
}): Promise<UserSkaProfileSelect | null> => {
  const normalised = normaliseSkaProfile(profile);

  const [updated] = await db
    .update(userSkaProfileTable)
    .set({
      ...normalised,
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(userSkaProfileTable.userId, userId),
        eq(userSkaProfileTable.courseId, courseId),
      ),
    )
    .returning();

  return updated ?? null;
};
