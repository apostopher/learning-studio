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
      snapshot: snapshot as Snapshot<unknown>,
      // `input` is required by createActor's types whenever the machine
      // declares one, and harmless here: on the restore path the machine's
      // `context` factory is never called (the snapshot already carries a
      // fully-formed context), so this value is only used for the init event.
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
  const newTurns = transcript.slice(input.initialMessages.length);

  actor.stop();

  return {
    snapshot: persisted,
    status: toStatus(String(settled.value), settled.status),
    transcript,
    newTurns,
    restoredFromSnapshot: restored !== null,
  };
};
