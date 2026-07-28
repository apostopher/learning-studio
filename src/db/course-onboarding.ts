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
 * Deletes the row; course_onboarding_messages.onboarding_id cascades, so the
 * transcript goes with it. One operation is what makes "stop and delete
 * everything shared, no explanation needed" true.
 */
export const deleteOnboarding = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<void> => {
  await db
    .delete(courseOnboardingTable)
    .where(eq(courseOnboardingTable.id, onboardingId));
};
