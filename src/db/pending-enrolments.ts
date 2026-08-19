import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseSubscriptionsTable,
  coursesTable,
  pendingEnrolmentsTable,
} from '#/db/schema';
import { ensureEnrolmentLevel } from '#/db/user-levels';

/**
 * Pre-assign a course to an email that may not have an account yet.
 *
 * No notification is sent — the person is simply ready when they next log in.
 */
export async function addPendingEnrolment(options: {
  email: string;
  courseId: number;
  addedBy: string;
}): Promise<void> {
  await db
    .insert(pendingEnrolmentsTable)
    .values({
      email: options.email.toLowerCase(),
      courseId: options.courseId,
      addedBy: options.addedBy,
    })
    .onConflictDoNothing({
      target: [pendingEnrolmentsTable.email, pendingEnrolmentsTable.courseId],
    });
}

/** Remove a pre-assignment that hasn't been claimed yet. */
export async function removePendingEnrolment(
  email: string,
  courseId: number,
): Promise<void> {
  await db
    .delete(pendingEnrolmentsTable)
    .where(
      and(
        eq(pendingEnrolmentsTable.email, email.toLowerCase()),
        eq(pendingEnrolmentsTable.courseId, courseId),
        isNull(pendingEnrolmentsTable.claimedAt),
      ),
    );
}

export type PendingPerson = {
  email: string;
  addedAt: Date;
  courses: { id: number; name: string }[];
};

/**
 * Emails that have been pre-assigned courses but never signed in, grouped per
 * person so the users table can show them as rows alongside real accounts.
 */
export async function listUnclaimedEnrolments(): Promise<PendingPerson[]> {
  const rows = await db
    .select({
      email: pendingEnrolmentsTable.email,
      addedAt: pendingEnrolmentsTable.addedAt,
      courseId: coursesTable.id,
      courseName: coursesTable.name,
    })
    .from(pendingEnrolmentsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, pendingEnrolmentsTable.courseId),
    )
    .where(isNull(pendingEnrolmentsTable.claimedAt))
    .orderBy(asc(pendingEnrolmentsTable.email));

  const byEmail = new Map<string, PendingPerson>();
  for (const row of rows) {
    const existing = byEmail.get(row.email);
    if (existing) {
      existing.courses.push({ id: row.courseId, name: row.courseName });
      // Oldest add wins, so the column reads as "waiting since".
      if (row.addedAt < existing.addedAt) existing.addedAt = row.addedAt;
    } else {
      byEmail.set(row.email, {
        email: row.email,
        addedAt: row.addedAt,
        courses: [{ id: row.courseId, name: row.courseName }],
      });
    }
  }
  return [...byEmail.values()];
}

/** Unclaimed course ids pre-assigned to one email. */
export async function getPendingCourseIds(email: string): Promise<number[]> {
  const rows = await db
    .select({ courseId: pendingEnrolmentsTable.courseId })
    .from(pendingEnrolmentsTable)
    .where(
      and(
        eq(pendingEnrolmentsTable.email, email.toLowerCase()),
        isNull(pendingEnrolmentsTable.claimedAt),
      ),
    );
  return rows.map((r) => r.courseId);
}

/**
 * Apply every unclaimed pre-assignment for this email as a real entitlement.
 *
 * Called from the sign-in hook, after the profile row exists — the
 * `course_subscriptions.user_id` FK depends on it, so ordering is not
 * cosmetic. Runs in one transaction so a partially-claimed person can't exist,
 * and stamps `claimedAt` rather than deleting so the invite history survives.
 *
 * Returns the number of entitlements granted.
 */
export async function claimPendingEnrolments(options: {
  userId: string;
  email: string;
}): Promise<number> {
  const email = options.email.toLowerCase();

  return db.transaction(async (tx) => {
    const pending = await tx
      .select({
        id: pendingEnrolmentsTable.id,
        courseId: pendingEnrolmentsTable.courseId,
        addedBy: pendingEnrolmentsTable.addedBy,
      })
      .from(pendingEnrolmentsTable)
      .where(
        and(
          eq(pendingEnrolmentsTable.email, email),
          isNull(pendingEnrolmentsTable.claimedAt),
        ),
      );
    if (pending.length === 0) return 0;

    await tx
      .insert(courseSubscriptionsTable)
      .values(
        pending.map((row) => ({
          userId: options.userId,
          courseId: row.courseId,
          // Credit the admin who pre-assigned it, not the sign-in itself.
          grantedBy: row.addedBy,
        })),
      )
      .onConflictDoNothing({
        target: [
          courseSubscriptionsTable.userId,
          courseSubscriptionsTable.courseId,
        ],
      });

    // Through the shared helper, on this transaction's executor — one copy of
    // the idempotency rule, not two.
    for (const row of pending) {
      await ensureEnrolmentLevel(options.userId, row.courseId, tx);
    }

    await tx
      .update(pendingEnrolmentsTable)
      .set({ claimedAt: sql`now()` })
      .where(
        and(
          eq(pendingEnrolmentsTable.email, email),
          isNull(pendingEnrolmentsTable.claimedAt),
        ),
      );

    return pending.length;
  });
}
