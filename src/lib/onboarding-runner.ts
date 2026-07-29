import { createActor, type Snapshot, waitFor } from 'xstate';
import {
  isSettled,
  type OnboardingStatus,
  toStatus,
} from '#/lib/onboarding-transport';
import {
  ONBOARDING_MACHINE_VERSION,
  type OnboardingEvent,
  type OnboardingInput,
  type OnboardingMessage,
  onboardingMachine,
} from '#/machines/onboarding-machine';

const DEFAULT_TIMEOUT_MS = 30_000;

type ProvidedMachine = ReturnType<typeof onboardingMachine.provide>;
type OnboardingActor = ReturnType<typeof createActor<ProvidedMachine>>;

export type RunTurnArgs = {
  /** The persisted snapshot from course_onboarding.machine_snapshot, or null. */
  snapshot: unknown;
  /** The version that snapshot was written with, or null. */
  snapshotVersion: string | null;
  input: OnboardingInput;
  implementations: Parameters<typeof onboardingMachine.provide>[0];
  /** null means "start": run to the first settled state without an event. */
  event: OnboardingEvent | null;
  timeoutMs?: number;
};

export type RunTurnResult = {
  snapshot: unknown;
  status: OnboardingStatus;
  transcript: OnboardingMessage[];
  /** Only the turns this call produced — what the route returns to the client. */
  newTurns: OnboardingMessage[];
  restoredFromSnapshot: boolean;
};

/**
 * Overlays request-scoped context values onto a persisted snapshot.
 *
 * Necessary because of the restore-path asymmetry documented in
 * `restoreActor`: the machine's `context` factory does NOT run when a snapshot
 * is restored, so anything arriving via `input` is ignored and the snapshot's
 * own (now stale) value survives. That is correct for genuine machine state
 * like `followUpCount`, and WRONG for `elapsedMinutes`, which is recomputed
 * from the durable row on every request and describes the world outside the
 * machine.
 *
 * Left unpatched, `elapsedMinutes` would stay pinned at whatever it was when
 * the session was first created — effectively always 0 — and the
 * ten-minute half of `shouldRemindControls` would never fire for anyone.
 *
 * Only ever ADDS/overwrites the listed keys, so a snapshot whose shape this
 * function does not recognise passes through untouched and
 * `restoreActor`'s error check still gets to reject it.
 */
const withRequestScopedContext = (
  snapshot: unknown,
  input: OnboardingInput,
): unknown => {
  if (
    snapshot === null ||
    typeof snapshot !== 'object' ||
    !('context' in snapshot)
  ) {
    return snapshot;
  }
  const typed = snapshot as { context?: unknown };
  if (typed.context === null || typeof typed.context !== 'object') {
    return snapshot;
  }
  return {
    ...typed,
    context: {
      ...(typed.context as Record<string, unknown>),
      elapsedMinutes: input.elapsedMinutes,
    },
  };
};

/**
 * Builds an actor from a persisted snapshot, or returns null if that snapshot
 * cannot be restored.
 *
 * XState does NOT surface an unrestorable snapshot as a throw from
 * `createActor`: `Actor`'s constructor calls `logic.restoreSnapshot` inside its
 * own try/catch and, on failure, parks the actor in a synthetic
 * `{ status: 'error' }` snapshot instead of rethrowing. Starting such an actor
 * routes that error to `_error()`, which — with no subscriber attached yet —
 * hands it to `reportUnhandledError` and rethrows it from a bare `setTimeout`,
 * i.e. as an unhandled exception that no request-level catch can reach.
 *
 * So the check has to happen here, on the *created but not yet started* actor.
 * A `try/catch` alone (as originally specified) would never fire.
 *
 * Any `error` status is treated as unrestorable, including one that was
 * genuinely persisted that way: an errored machine is terminal and cannot be
 * resumed, so restoring it would buy nothing and would risk exactly the
 * unhandled async throw described above on every subsequent request. `answers`
 * is durable, so starting fresh still places the trainee correctly.
 */
const restoreActor = (
  machine: ProvidedMachine,
  snapshot: unknown,
  input: OnboardingInput,
): OnboardingActor | null => {
  let actor: OnboardingActor;
  try {
    // The snapshot round-trips through the database as untyped jsonb, so the
    // cast back to XState's own persisted-snapshot type is unavoidable at this
    // boundary. Everything after this line is guarded by the status check.
    actor = createActor(machine, {
      snapshot: withRequestScopedContext(snapshot, input) as Snapshot<unknown>,
      // `input` is required by createActor's types whenever the machine
      // declares one. On the restore path the machine's `context` factory is
      // never called (the snapshot already carries a fully-formed context), so
      // this value is only used for the init event — which is exactly why
      // request-scoped values have to be overlaid onto the snapshot above
      // rather than passed here.
      input,
    });
  } catch {
    return null;
  }

  if (actor.getSnapshot().status === 'error') {
    // Never started, so there is nothing to stop — dropping the reference is
    // the whole teardown.
    return null;
  }

  return actor;
};

const sameTurn = (a: OnboardingMessage, b: OnboardingMessage): boolean =>
  a.role === b.role && a.text === b.text;

/**
 * The turns this call appended, found by diffing content rather than length.
 *
 * A length-based `transcript.slice(prior.length)` is wrong in two ways once a
 * session gets long. The machine caps `context.transcript` at
 * `TRANSCRIPT_TURN_LIMIT` (see `appendTranscript` in onboarding-machine.ts) —
 * it trims when seeding from `initialMessages` and again on every append — so:
 *
 * 1. `input.initialMessages` is the RAW, untrimmed row set from the database
 *    and can be far longer than the transcript the machine actually retains,
 *    and on the restore path the transcript comes from the persisted snapshot
 *    and has nothing to do with `initialMessages` at all.
 * 2. Once the transcript sits AT the cap its length stops growing, so even the
 *    correctly-trimmed prior length (`min(raw, TRANSCRIPT_TURN_LIMIT)`) still
 *    indexes past the end.
 *
 * Either way `.slice()` silently returns `[]`, and a trainee resuming a long
 * interview would be told the machine produced no new turns when it did.
 *
 * Trimming only ever drops from the front, so the settled transcript is
 * `[...prior, ...appended]` with some prefix removed: the longest prefix of
 * `settled` that equals a suffix of `prior` is what was carried over, and
 * everything after it is new. Bounded by TRANSCRIPT_TURN_LIMIT, so the
 * quadratic worst case is a few hundred string compares.
 */
const newTurnsSince = (
  prior: OnboardingMessage[],
  settled: OnboardingMessage[],
): OnboardingMessage[] => {
  for (
    let carried = Math.min(prior.length, settled.length);
    carried > 0;
    carried--
  ) {
    const carriedTurns = prior.slice(prior.length - carried);
    if (carriedTurns.every((turn, i) => sameTurn(turn, settled[i]))) {
      return settled.slice(carried);
    }
  }
  return settled;
};

/**
 * Runs exactly one onboarding turn and returns the machine's settled state.
 *
 * Pure and injectable on purpose: it takes the implementations rather than
 * building them, and imports nothing from `@/db` or `ai`. That is what makes
 * the snapshot round-trip testable — and the property it protects is not
 * cosmetic. Eight of OnboardingContext's ten fields cannot be rebuilt from
 * the database, so without an exact restore the follow-up and consent
 * clarification caps would silently reset on every request.
 */
export const runOnboardingTurn = async ({
  snapshot,
  snapshotVersion,
  input,
  implementations,
  event,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: RunTurnArgs): Promise<RunTurnResult> => {
  const machine = onboardingMachine.provide(implementations);

  const versionMatches =
    snapshot != null && snapshotVersion === ONBOARDING_MACHINE_VERSION;

  // A shape change shipped without a version bump lands on the null branch.
  // The version expresses intent; restoreActor is the net.
  const restored = versionMatches
    ? restoreActor(machine, snapshot, input)
    : null;

  const actor = restored ?? createActor(machine, { input });

  // The transcript this turn starts from, read before `start()` so it reflects
  // what the machine actually holds: the snapshot's own transcript on the
  // restore path, and `initialMessages` already trimmed to
  // TRANSCRIPT_TURN_LIMIT on the fresh path. XState computes the initial
  // snapshot in `createActor`, so this is populated before the actor runs.
  const priorTranscript = actor.getSnapshot().context.transcript;

  actor.start();

  if (event) {
    actor.send(event);
  }

  // Time-boxed on purpose: waitFor's timeout defaults to Infinity, so a hung
  // actor would hold the HTTP request open indefinitely rather than failing.
  await waitFor(actor, (s) => isSettled(String(s.value), s.status), {
    timeout: timeoutMs,
  });

  const settled = actor.getSnapshot();
  // Read before stopping: stopping is what releases the actor's subscribers
  // and children, and the persisted snapshot must describe the settled turn.
  const persisted = actor.getPersistedSnapshot();
  const transcript = settled.context.transcript;
  const newTurns = newTurnsSince(priorTranscript, transcript);

  actor.stop();

  return {
    snapshot: persisted,
    status: toStatus(String(settled.value), settled.status),
    transcript,
    newTurns,
    restoredFromSnapshot: restored !== null,
  };
};
