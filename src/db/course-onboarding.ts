import { and, asc, eq, sql } from 'drizzle-orm';
import { hashQuestionSet } from '#/lib/course-onboarding';
import {
  type OnboardingQuestionSource,
  resolveQuestionSet,
} from '#/lib/onboarding-session';
import type { OnboardingQuestions } from '#/types';
import { db } from '@/db';
import {
  type CourseOnboardingMessagesSelect,
  type CourseOnboardingSelect,
  courseOnboardingMessagesTable,
  courseOnboardingTable,
  coursesTable,
} from '@/db/schema';

/**
 * Inserts the (userId, courseId) row, freezing questionSource at creation
 * time. Races against a concurrent tab creating the same row: the unique
 * index on (user_id, course_id) makes the loser's insert a no-op via
 * onConflictDoNothing, and it then re-reads the winner's row rather than
 * erroring.
 */
async function createOnboardingRow({
  userId,
  courseId,
  courseQuestions,
}: {
  userId: string;
  courseId: number;
  courseQuestions: OnboardingQuestions;
}): Promise<CourseOnboardingSelect> {
  const { source } = resolveQuestionSet(courseQuestions, null);

  const [inserted] = await db
    .insert(courseOnboardingTable)
    .values({ userId, courseId, questionSource: source })
    .onConflictDoNothing({
      target: [courseOnboardingTable.userId, courseOnboardingTable.courseId],
    })
    .returning();

  if (inserted) return inserted;

  const [row] = await db
    .select()
    .from(courseOnboardingTable)
    .where(
      and(
        eq(courseOnboardingTable.userId, userId),
        eq(courseOnboardingTable.courseId, courseId),
      ),
    );

  if (!row) {
    throw new Error(
      `loadOnboardingSession: failed to create or load onboarding row for user ${userId}, course ${courseId}`,
    );
  }

  return row;
}

/**
 * Finds or creates the course_onboarding row for this user+course, resolves
 * the effective question set, and returns the transcript alongside it.
 *
 * questionSource is frozen on creation (see createOnboardingRow) and then
 * passed straight through to resolveQuestionSet on every subsequent load —
 * this is what stops a user who onboarded on the built-in defaults being
 * re-interviewed when an admin later adds course-specific questions.
 */
export const loadOnboardingSession = async ({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}): Promise<{
  row: CourseOnboardingSelect;
  messages: CourseOnboardingMessagesSelect[];
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
}> => {
  const [course] = await db
    .select({ onboardingQuestions: coursesTable.onboardingQuestions })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));

  if (!course) {
    throw new Error(`loadOnboardingSession: course ${courseId} not found`);
  }

  const courseQuestions = course.onboardingQuestions;

  const [existing] = await db
    .select()
    .from(courseOnboardingTable)
    .where(
      and(
        eq(courseOnboardingTable.userId, userId),
        eq(courseOnboardingTable.courseId, courseId),
      ),
    );

  const row =
    existing ??
    (await createOnboardingRow({ userId, courseId, courseQuestions }));

  // row.questionSource is `string | null` (plain varchar); this is a type
  // assertion, not a value coercion — the frozen source is passed straight
  // through to resolveQuestionSet, which already handles null.
  const { questions, source } = resolveQuestionSet(
    courseQuestions,
    row.questionSource as OnboardingQuestionSource | null,
  );

  // The `parts` column has no `$type<>` override, so drizzle infers `unknown`
  // for a raw select — while the exported select type (built from
  // createSelectSchema) narrows it to the recursive `Json` shape. Both
  // describe the same runtime jsonb value; this cast just reconciles the two
  // static views of it.
  const messages = (await db
    .select()
    .from(courseOnboardingMessagesTable)
    .where(eq(courseOnboardingMessagesTable.onboardingId, row.id))
    .orderBy(
      asc(courseOnboardingMessagesTable.order),
    )) as CourseOnboardingMessagesSelect[];

  return { row, messages, questions, source };
};

/**
 * Reads the course_onboarding row for this user+course WITHOUT creating one —
 * unlike loadOnboardingSession, which always creates a row so the machine has
 * something to run against. A pure status check must never have that side
 * effect: merely checking whether onboarding has started must not itself
 * start it.
 */
export const findOnboardingRow = async ({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}): Promise<CourseOnboardingSelect | null> => {
  const [row] = await db
    .select()
    .from(courseOnboardingTable)
    .where(
      and(
        eq(courseOnboardingTable.userId, userId),
        eq(courseOnboardingTable.courseId, courseId),
      ),
    );

  return row ?? null;
};

/**
 * Whether the learner has ever sent at least one reply for this onboarding
 * session — the signal that distinguishes "greeted but never responded to
 * consent" from "actually engaged," without reading the machine's internal
 * state (which would couple this check to the machine's state-name shape,
 * something Task 2's design note explicitly avoids).
 */
export const hasUserReply = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<boolean> => {
  const [row] = await db
    .select({ id: courseOnboardingMessagesTable.id })
    .from(courseOnboardingMessagesTable)
    .where(
      and(
        eq(courseOnboardingMessagesTable.onboardingId, onboardingId),
        eq(courseOnboardingMessagesTable.role, 'user'),
      ),
    )
    .limit(1);

  return row != null;
};

/**
 * Merges one answer into the row's jsonb answers map with a single UPDATE
 * (`answers || patch::jsonb`) instead of a read-modify-write. Two browser
 * tabs answering different questions concurrently both apply cleanly — the
 * merge happens in Postgres against the current row value, so neither
 * transaction can overwrite the other's key based on a stale read. Also
 * restamps questionSetHash so admin views can detect a response taken
 * against a question set that has since changed.
 */
export const saveAnswer = async ({
  onboardingId,
  questionId,
  answer,
  questions,
}: {
  onboardingId: number;
  questionId: string;
  answer: string;
  questions: OnboardingQuestions;
}): Promise<void> => {
  const patch = JSON.stringify({ [questionId]: answer });

  await db
    .update(courseOnboardingTable)
    .set({
      answers: sql`${courseOnboardingTable.answers} || ${patch}::jsonb`,
      questionSetHash: hashQuestionSet(questions),
      updatedAt: sql`now()`,
    })
    .where(eq(courseOnboardingTable.id, onboardingId));
};

/**
 * Appends one transcript turn. onConflictDoNothing against the
 * (onboarding_id, order) unique index makes a retried request idempotent
 * instead of duplicating the turn.
 */
export const appendMessage = async ({
  onboardingId,
  role,
  text,
  order,
}: {
  onboardingId: number;
  role: 'assistant' | 'user';
  text: string;
  order: number;
}): Promise<void> => {
  await db
    .insert(courseOnboardingMessagesTable)
    .values({
      onboardingId,
      role,
      parts: [{ type: 'text', text }],
      order,
    })
    .onConflictDoNothing({
      target: [
        courseOnboardingMessagesTable.onboardingId,
        courseOnboardingMessagesTable.order,
      ],
    });
};

export const completeOnboarding = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<void> => {
  await db
    .update(courseOnboardingTable)
    .set({ onboardingCompletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(courseOnboardingTable.id, onboardingId));
};

export const declineConsent = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<void> => {
  await db
    .update(courseOnboardingTable)
    .set({ consentDeclinedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(courseOnboardingTable.id, onboardingId));
};

/**
 * Tombstones the row rather than deleting it: clears the shared answers and
 * removes the transcript, but keeps the row so shouldOfferOnboarding sees
 * `deletedAt` set and never re-offers onboarding to someone who withdrew.
 * Deleting the row outright would have un-declined the user — `row == null`
 * reads as "never asked" to shouldOfferOnboarding, which is the exact
 * re-pitch withdrawal is meant to prevent.
 *
 * The messages table's cascade only fires on a real row delete, so with the
 * row surviving, the transcript is no longer cleaned up for free — it must
 * be deleted explicitly here. That delete and the tombstoning update run in
 * one transaction so a partial failure cannot leave answers cleared with the
 * transcript intact, or vice versa.
 *
 * questionSetHash, questionSource, consentDeclinedAt, and
 * onboardingCompletedAt are left untouched: they describe the session
 * itself, not content the user shared, so withdrawal doesn't erase them.
 *
 * machineSnapshot IS cleared, and that is not housekeeping: the persisted
 * snapshot embeds the machine's whole context, including `answers` and up to
 * TRANSCRIPT_TURN_LIMIT turns of `transcript` — i.e. copies of the exact
 * things the two statements above are deleting. Leaving it would make
 * withdrawal cosmetic, and would let the next request restore a machine
 * holding the transcript this call just removed. machineVersion goes with it
 * so no version/snapshot mismatch is left behind.
 */
export const deleteOnboarding = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx
      .delete(courseOnboardingMessagesTable)
      .where(eq(courseOnboardingMessagesTable.onboardingId, onboardingId));

    await tx
      .update(courseOnboardingTable)
      .set({
        answers: {},
        machineSnapshot: null,
        machineVersion: null,
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(courseOnboardingTable.id, onboardingId));
  });
};

/**
 * Persist the machine's settled state after a turn. `updatedAt` is set
 * explicitly — no table in this schema uses $onUpdate, and a stale
 * updatedAt would break the concurrency guard the routes rely on.
 *
 * Returns the `updatedAt` it just wrote (null if the row no longer exists).
 * The turn response carries that value back to the client as the token for
 * its next `expectedUpdatedAt`, so it has to be the post-write timestamp:
 * echoing the value read before this UPDATE would make every follow-up reply
 * look stale and 409 forever. `.returning()` keeps it in this one round trip
 * rather than a second SELECT.
 */
export const saveMachineSnapshot = async ({
  onboardingId,
  snapshot,
  version,
}: {
  onboardingId: number;
  snapshot: Record<string, unknown>;
  version: string;
}): Promise<Date | null> => {
  const [updated] = await db
    .update(courseOnboardingTable)
    .set({
      machineSnapshot: snapshot,
      machineVersion: version,
      updatedAt: sql`now()`,
    })
    .where(eq(courseOnboardingTable.id, onboardingId))
    .returning({ updatedAt: courseOnboardingTable.updatedAt });

  return updated?.updatedAt ?? null;
};

/**
 * Drop the persisted snapshot without touching anything else, returning the
 * `updatedAt` it wrote (null if the row is gone).
 *
 * Needed for the turn that ends in `deleted`: the machine's own
 * `deleteOnboarding` actor has already tombstoned the row, so writing that
 * turn's snapshot would re-persist the transcript and answers the tombstone
 * just cleared — see deleteOnboarding above. Clearing is idempotent, so it is
 * safe to run after that actor has already nulled these columns.
 */
export const clearMachineSnapshot = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<Date | null> => {
  const [updated] = await db
    .update(courseOnboardingTable)
    .set({
      machineSnapshot: null,
      machineVersion: null,
      updatedAt: sql`now()`,
    })
    .where(eq(courseOnboardingTable.id, onboardingId))
    .returning({ updatedAt: courseOnboardingTable.updatedAt });

  return updated?.updatedAt ?? null;
};
