import { getCourseIdentityBySlug } from '#/db/course';
import {
  clearMachineSnapshot,
  deleteOnboarding,
  loadOnboardingSession,
  saveMachineSnapshot,
} from '#/db/course-onboarding';
import { runOnboardingTurn } from '#/lib/onboarding-runner';
import {
  messageRowsToTranscript,
  type OnboardingStatus,
  transcriptToUIMessages,
  type UIMessageLike,
} from '#/lib/onboarding-transport';
import { createOnboardingImplementations } from '#/machines/onboarding-implementations';
import {
  ONBOARDING_MACHINE_VERSION,
  type OnboardingEvent,
} from '#/machines/onboarding-machine';

/**
 * The one payload every onboarding route answers with. `status` is the
 * machine's settled state — the client renders against it and never infers
 * state from message content.
 */
export type OnboardingTurnResponse = {
  status: OnboardingStatus;
  messages: UIMessageLike[];
  /**
   * The row's `updated_at` after this turn, ISO-8601. The client sends it back
   * as `expectedUpdatedAt` on its next reply; see `advanceOnboarding`.
   */
  updatedAt: string;
};

export type AdvanceOnboardingResult =
  | { ok: true; body: OnboardingTurnResponse }
  | { ok: false; reason: 'course_not_found' | 'stale' };

/**
 * One serialisation of `updated_at`, used for both the value handed to the
 * client and the value compared against `expectedUpdatedAt`. The two MUST go
 * through the same function or the concurrency guard fires on every request.
 *
 * ISO-8601 rather than epoch millis so the token is legible in a network log.
 * The column is `timestamp` at microsecond precision while drizzle's
 * `mode: 'date'` gives millisecond `Date`s, so two writes inside the same
 * millisecond are indistinguishable here — the guard catches a second tab
 * replying, not two writes racing inside one millisecond, and the row's
 * unique index plus `appendMessage`'s idempotent insert cover that case.
 */
const serialiseUpdatedAt = (value: Date): string => value.toISOString();

/**
 * The status of a session the user has already closed, or null if it is still
 * live. A closed session is reported as-is and the machine is never run for
 * it, which is what stops a request re-opening a decision the user made.
 *
 * Withdrawal is checked first and matters most: `deleteOnboarding` clears the
 * row's answers, transcript, AND persisted snapshot, so without this guard a
 * `start` would find nothing to restore, build a fresh machine, and greet the
 * user again — writing new transcript rows in the process. That is exactly the
 * re-offer the tombstone exists to prevent (see deleteOnboarding and
 * shouldOfferOnboarding). A refused consent is the same kind of decision, and
 * a finished interview needs no further turns.
 *
 * Consequence, deliberately accepted: there is no "start over" through this
 * function. Re-opening a closed session has to be an explicit, separate action
 * that clears the timestamp — not a side effect of the client calling `start`.
 *
 * Loose `!= null` matches shouldOfferOnboarding and isOnboardingComplete: it
 * also catches a timestamp arriving as undefined across a serialisation
 * boundary. Do not tighten to `!==`.
 */
const closedSessionStatus = ({
  deletedAt,
  consentDeclinedAt,
  onboardingCompletedAt,
}: {
  deletedAt: Date | null;
  consentDeclinedAt: Date | null;
  onboardingCompletedAt: Date | null;
}): OnboardingStatus | null => {
  if (deletedAt != null) return 'deleted';
  if (consentDeclinedAt != null) return 'declined';
  if (onboardingCompletedAt != null) return 'complete';
  return null;
};

/**
 * Runs one onboarding turn for this user and course, persisting the machine's
 * settled state, and returns what the client should render.
 *
 * SECURITY: `userId` is a parameter, never derived here. The route is the only
 * place a session is read, and `loadOnboardingSession({ userId, courseId })`
 * is the single ownership check every downstream write depends on — every
 * persistence actor in onboarding-implementations.ts takes a bare
 * `onboardingId` with no check of its own, and the id it gets comes only from
 * that call's result. Do not add a path that lets a caller supply
 * `onboardingId` or a user id from request data.
 *
 * `event: null` means "start": run to the first settled state without sending
 * anything, which produces the greeting on a fresh session and simply replays
 * the settled state of a resumed one.
 */
export const advanceOnboarding = async ({
  userId,
  courseSlug,
  event,
  expectedUpdatedAt,
}: {
  userId: string;
  courseSlug: string;
  event: OnboardingEvent | null;
  /**
   * The `updatedAt` the caller last saw. When it no longer matches the row,
   * another tab (or a double-submit) has already advanced this session and
   * this turn is refused as `stale` rather than silently overwriting the other
   * turn — last-write-wins would make one tab's turn vanish invisibly.
   */
  expectedUpdatedAt?: string | null;
}): Promise<AdvanceOnboardingResult> => {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) {
    return { ok: false, reason: 'course_not_found' };
  }

  const { row, messages, questions } = await loadOnboardingSession({
    userId,
    courseId: course.id,
  });

  if (
    expectedUpdatedAt != null &&
    expectedUpdatedAt !== serialiseUpdatedAt(row.updatedAt)
  ) {
    return { ok: false, reason: 'stale' };
  }

  const closed = closedSessionStatus(row);
  if (closed) {
    // Report the closed session rather than running a turn against it. The
    // transcript still comes from the rows, so a completed interview replays
    // in full and a withdrawn one is correctly empty.
    return {
      ok: true,
      body: {
        status: closed,
        messages: transcriptToUIMessages(messageRowsToTranscript(messages)),
        updatedAt: serialiseUpdatedAt(row.updatedAt),
      },
    };
  }

  const result = await runOnboardingTurn({
    snapshot: row.machineSnapshot,
    snapshotVersion: row.machineVersion,
    input: {
      onboardingId: row.id,
      questions,
      answers: row.answers,
      // Both of onboarding's dangling wires get their producer here: the
      // persisted transcript seeds the machine's context, and its row count
      // seeds the `order` sequence the implementations append with. They come
      // from the same read so the two can never disagree.
      initialMessages: messageRowsToTranscript(messages),
    },
    implementations: createOnboardingImplementations({
      courseName: course.name,
      initialMessageCount: messages.length,
      questions,
    }),
    event,
  });

  // A turn that ended in `deleted` has already had its row tombstoned by the
  // machine's own deleteOnboarding actor. Persisting this turn's snapshot
  // would put the transcript and answers straight back — the snapshot embeds
  // the whole machine context — so the snapshot is cleared instead of saved.
  const updatedAt =
    result.status === 'deleted'
      ? await clearMachineSnapshot({ onboardingId: row.id })
      : await saveMachineSnapshot({
          onboardingId: row.id,
          // getPersistedSnapshot() always yields a plain object; the runner
          // types it `unknown` because it round-trips through jsonb.
          snapshot: result.snapshot as Record<string, unknown>,
          version: ONBOARDING_MACHINE_VERSION,
        });

  return {
    ok: true,
    body: {
      status: result.status,
      // The FULL transcript, not `result.newTurns`: the client renders the
      // whole conversation, and a full list is idempotent against a retried
      // request where a delta would duplicate or drop turns. `newTurns` is
      // deliberately unused here — it exists for callers that want a delta.
      messages: transcriptToUIMessages(result.transcript),
      updatedAt: serialiseUpdatedAt(updatedAt ?? row.updatedAt),
    },
  };
};

/**
 * Withdraws everything the user shared for this course: clears the answers,
 * removes the transcript, and tombstones the row so onboarding is never
 * re-offered. Distinct from the machine's DELETE event — this is the explicit
 * "delete my data" control, and it does not need the machine to run.
 *
 * `ok: false` means the slug did not resolve; the route answers 404. Same
 * ownership rule as `advanceOnboarding`: `userId` comes from the session
 * only, and `onboardingId` only ever from `loadOnboardingSession`'s result.
 */
export const deleteOnboardingSession = async ({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<{ ok: boolean }> => {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) {
    return { ok: false };
  }

  const { row } = await loadOnboardingSession({
    userId,
    courseId: course.id,
  });

  await deleteOnboarding({ onboardingId: row.id });

  return { ok: true };
};
