import { describe, expect, it, vi } from 'vitest';
import { fromPromise } from 'xstate';
import { flattenQuestions } from '#/lib/course-onboarding';
import { runOnboardingTurn } from '#/lib/onboarding-runner';
import {
  FOLLOW_UP_CAP,
  ONBOARDING_MACHINE_VERSION,
  type OnboardingContext,
  type OnboardingInput,
  TRANSCRIPT_TURN_LIMIT,
} from '#/machines/onboarding-machine';
import type {
  OnboardingConsentEvaluation,
  OnboardingReplyEvaluation,
} from '#/types';

// The machine takes the FLATTENED list, so these go through the real
// `flattenQuestions` rather than being hand-written flat — a fixture that
// skipped it could disagree with what production actually feeds the machine.
const ONE = flattenQuestions([
  {
    id: 'c1',
    name: 'Only category',
    questions: [{ id: 'q1', text: 'Only question?' }],
  },
]);

const baseInput = (
  overrides: Partial<OnboardingInput> = {},
): OnboardingInput => ({
  onboardingId: 1,
  questions: ONE,
  answers: {},
  initialMessages: [],
  elapsedMinutes: 0,
  ...overrides,
});

/**
 * Every stub is written with explicit `fromPromise` type arguments that mirror
 * the machine's own `setup({ actors })` declarations. Without them TypeScript
 * infers each stub's input as `NonReducibleUnknown`, which is not assignable
 * to the declared actor input — the whole `implementations` object is then
 * rejected. Spelling the shapes out also means a change to an actor's input
 * breaks these stubs loudly instead of silently drifting.
 */
const consentStub = (evaluation: OnboardingConsentEvaluation) =>
  fromPromise<
    OnboardingConsentEvaluation,
    { context: OnboardingContext; reply: string }
  >(async () => evaluation);

/**
 * Stub implementations. `replyVerdicts` is consumed one per evaluateReply
 * call so a test can script a follow-up loop across simulated requests.
 */
function stubs({
  replyVerdicts = [],
  saveAnswer = vi.fn(async () => {}),
}: {
  replyVerdicts?: OnboardingReplyEvaluation[];
  saveAnswer?: () => Promise<void>;
} = {}) {
  const queue = [...replyVerdicts];
  return {
    actors: {
      greet: fromPromise<string, { context: OnboardingContext }>(
        async () => 'Welcome — may I ask a few questions?',
      ),
      evaluateConsent: consentStub({ status: 'consented', reply: null }),
      signOff: fromPromise<string, { context: OnboardingContext }>(
        async () => 'No problem at all.',
      ),
      declineConsent: fromPromise<void, { onboardingId: number }>(
        async () => {},
      ),
      askQuestion: fromPromise<
        string,
        { context: OnboardingContext; questionId: string }
      >(async () => 'So, tell me about you?'),
      evaluateReply: fromPromise<
        OnboardingReplyEvaluation,
        { context: OnboardingContext; questionId: string; reply: string }
      >(async () => {
        const next = queue.shift();
        if (!next) throw new Error('evaluateReply called more than scripted');
        return next;
      }),
      saveAnswer: fromPromise<
        void,
        { onboardingId: number; questionId: string; answer: string }
      >(saveAnswer),
      summarise: fromPromise<string, { context: OnboardingContext }>(
        async () => "Here's what I heard…",
      ),
      completeOnboarding: fromPromise<void, { onboardingId: number }>(
        async () => {},
      ),
      deleteOnboarding: fromPromise<void, { onboardingId: number }>(
        async () => {},
      ),
    },
  };
}

const vague: OnboardingReplyEvaluation = {
  status: 'needs_follow_up',
  answer: null,
  followUp: 'Could you say more?',
  hesitancy: false,
};

describe('runOnboardingTurn — starting', () => {
  it('produces the greeting and settles awaiting consent', async () => {
    const result = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    expect(result.status).toBe('awaiting_consent');
    expect(result.newTurns.map((t) => t.role)).toContain('assistant');
    expect(result.restoredFromSnapshot).toBe(false);
    expect(result.snapshot).toBeDefined();
  });

  it('reports only the turns this call produced, not the whole transcript', async () => {
    const priorTurns = [
      { role: 'assistant' as const, text: 'earlier' },
      { role: 'user' as const, text: 'earlier reply' },
    ];
    const result = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ initialMessages: priorTurns }),
      implementations: stubs(),
      event: null,
    });
    expect(result.transcript.length).toBeGreaterThan(priorTurns.length);
    expect(result.newTurns).not.toContainEqual(priorTurns[0]);
  });
});

describe('runOnboardingTurn — newTurns past the transcript cap', () => {
  // Distinct texts so the content diff has no ambiguous match to find.
  const longHistory = Array.from(
    { length: TRANSCRIPT_TURN_LIMIT + 5 },
    (_, i) => ({
      role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
      text: `seeded turn ${i}`,
    }),
  );

  it('reports the produced turn when initialMessages exceeds the cap', async () => {
    // The machine trims its transcript to the last TRANSCRIPT_TURN_LIMIT turns
    // both when seeding and when appending, so the RAW initialMessages length
    // is past the end of the transcript the machine actually holds. Slicing by
    // it returned [] — the trainee would have seen no reply at all.
    const result = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ initialMessages: longHistory }),
      implementations: stubs(),
      event: null,
    });

    expect(result.transcript).toHaveLength(TRANSCRIPT_TURN_LIMIT);
    expect(result.newTurns).toEqual([
      { role: 'assistant', text: 'Welcome — may I ask a few questions?' },
    ]);
  });

  it('reports only this call’s turns when resuming a capped session', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ initialMessages: longHistory }),
      implementations: stubs(),
      event: null,
    });

    const consent = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput({ initialMessages: longHistory }),
      implementations: stubs(),
      event: { type: 'REPLY', text: 'yes please' },
    });

    expect(consent.status).toBe('awaiting_answer');
    expect(consent.restoredFromSnapshot).toBe(true);
    // Exactly the user turn this call carried plus the question it produced —
    // not the whole trimmed transcript, and not [].
    expect(consent.newTurns).toEqual([
      { role: 'user', text: 'yes please' },
      { role: 'assistant', text: 'So, tell me about you?' },
    ]);
    // Still at the cap, so length alone could not have told us that.
    expect(consent.transcript).toHaveLength(TRANSCRIPT_TURN_LIMIT);
    expect(consent.newTurns).not.toContainEqual(longHistory[0]);
  });
});

describe('runOnboardingTurn — snapshot round-trip', () => {
  it('restores followUpCount so the follow-up cap still bounds across requests', async () => {
    // THE test this whole module exists for. Rebuilding context fresh each
    // request would reset followUpCount every turn, so `needs_follow_up`
    // would loop without bound. Each runOnboardingTurn call below is a
    // separate simulated HTTP request.
    let snapshot: unknown = null;
    let version: string | null = null;

    const start = await runOnboardingTurn({
      snapshot,
      snapshotVersion: version,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    snapshot = start.snapshot;
    version = ONBOARDING_MACHINE_VERSION;

    const consent = await runOnboardingTurn({
      snapshot,
      snapshotVersion: version,
      input: baseInput(),
      implementations: stubs(),
      event: { type: 'REPLY', text: 'yes' },
    });
    expect(consent.status).toBe('awaiting_answer');
    expect(consent.restoredFromSnapshot).toBe(true);
    snapshot = consent.snapshot;

    // Feed FOLLOW_UP_CAP vague replies, one per "request". The cap must be
    // reached — proving the counter survived every teardown.
    const saveAnswer = vi.fn(async () => {});
    for (let i = 0; i < FOLLOW_UP_CAP; i++) {
      const turn = await runOnboardingTurn({
        snapshot,
        snapshotVersion: version,
        input: baseInput(),
        implementations: stubs({ replyVerdicts: [vague], saveAnswer }),
        event: { type: 'REPLY', text: 'dunno' },
      });
      expect(turn.status).toBe('awaiting_answer');
      snapshot = turn.snapshot;
    }
    expect(saveAnswer).not.toHaveBeenCalled();

    // One more vague reply is past the cap: the machine must stop following
    // up and persist the answer instead.
    const capped = await runOnboardingTurn({
      snapshot,
      snapshotVersion: version,
      input: baseInput(),
      implementations: stubs({ replyVerdicts: [vague], saveAnswer }),
      event: { type: 'REPLY', text: 'still dunno' },
    });
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(capped.status).toBe('confirming');
  });
});

describe('runOnboardingTurn — version guard', () => {
  it('discards a snapshot whose version does not match and starts fresh', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });

    const result = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: 'some-old-version',
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    expect(result.restoredFromSnapshot).toBe(false);
    expect(result.status).toBe('awaiting_consent');
  });

  it('falls back to fresh rather than throwing on an unrestorable snapshot', async () => {
    // A shape change shipped without a version bump must degrade, not 500.
    const result = await runOnboardingTurn({
      snapshot: { nonsense: true },
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    expect(result.restoredFromSnapshot).toBe(false);
    expect(result.status).toBe('awaiting_consent');
  });

  it('resumes at the next unanswered question after discarding a snapshot', async () => {
    // The reason discarding is safe: `answers` is durable, so a fresh
    // machine still places the user correctly rather than restarting the
    // interview.
    const TWO = flattenQuestions([
      {
        id: 'c1',
        name: 'Only category',
        questions: [
          { id: 'q1', text: 'First?' },
          { id: 'q2', text: 'Second?' },
        ],
      },
    ]);
    const result = await runOnboardingTurn({
      snapshot: { nonsense: true },
      snapshotVersion: 'stale',
      input: baseInput({ questions: TWO, answers: { q1: 'already answered' } }),
      implementations: stubs(),
      event: null,
    });
    expect(result.status).toBe('awaiting_consent');
    // Consent still gates; after consenting it must land on q2, not q1.
    const consented = await runOnboardingTurn({
      snapshot: result.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput({ questions: TWO, answers: { q1: 'already answered' } }),
      implementations: stubs(),
      event: { type: 'REPLY', text: 'yes' },
    });
    expect(consented.status).toBe('awaiting_answer');
  });
});

describe('runOnboardingTurn — terminal paths', () => {
  it('reports declined when consent is refused', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    const declined = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput(),
      implementations: {
        actors: {
          ...stubs().actors,
          evaluateConsent: consentStub({ status: 'declined', reply: null }),
        },
      },
      event: { type: 'REPLY', text: "I'd rather not" },
    });
    expect(declined.status).toBe('declined');
  });

  it('reports deleted on a DELETE event', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput(),
      implementations: stubs(),
      event: null,
    });
    const deleted = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput(),
      implementations: stubs(),
      event: { type: 'DELETE' },
    });
    expect(deleted.status).toBe('deleted');
  });
});

describe('runOnboardingTurn — request-scoped elapsedMinutes', () => {
  /**
   * `elapsedMinutes` is the one context field that describes the world OUTSIDE
   * the machine, so it must be refreshed on every request rather than restored.
   *
   * The restore path does not run the machine's `context` factory (see
   * `restoreActor`), so passing a fresh value via `input` alone is silently
   * ignored — the snapshot's stale value wins. Since a session is created at
   * elapsed ~0, that meant the ten-minute trigger could never fire for anybody.
   *
   * These assert on what an ACTOR was called with, not on context, because
   * "the value reached context" is exactly the check that would have passed
   * over the dead wiring.
   */
  const captureAskQuestion = () => {
    const seen: number[] = [];
    const askQuestion = fromPromise<
      string,
      { context: OnboardingContext; questionId: string }
    >(async ({ input }) => {
      seen.push(input.context.elapsedMinutes);
      return 'So, tell me about you?';
    });
    return { seen, askQuestion };
  };

  it('passes the fresh elapsedMinutes to actors when resuming a snapshot', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ elapsedMinutes: 0 }),
      implementations: stubs(),
      event: null,
    });

    const { seen, askQuestion } = captureAskQuestion();
    const resumed = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      // The trainee came back 42 minutes later.
      input: baseInput({ elapsedMinutes: 42 }),
      implementations: { actors: { ...stubs().actors, askQuestion } },
      event: { type: 'REPLY', text: 'yes' },
    });

    expect(resumed.restoredFromSnapshot).toBe(true);
    expect(seen).toEqual([42]);
  });

  it('does not let a stale snapshot value shadow the fresh one', async () => {
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ elapsedMinutes: 3 }),
      implementations: stubs(),
      event: null,
    });
    // The snapshot genuinely carries the old value…
    const persisted = start.snapshot as { context: { elapsedMinutes: number } };
    expect(persisted.context.elapsedMinutes).toBe(3);

    // …and the actor must still see the new one.
    const { seen, askQuestion } = captureAskQuestion();
    await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput({ elapsedMinutes: 99 }),
      implementations: { actors: { ...stubs().actors, askQuestion } },
      event: { type: 'REPLY', text: 'yes' },
    });
    expect(seen).toEqual([99]);
  });

  it('leaves genuine machine state alone while refreshing elapsedMinutes', async () => {
    // The overlay must not become a general-purpose context reset: turnCount is
    // real machine state and has to survive the round-trip.
    const start = await runOnboardingTurn({
      snapshot: null,
      snapshotVersion: null,
      input: baseInput({ elapsedMinutes: 0 }),
      implementations: stubs(),
      event: null,
    });
    const resumed = await runOnboardingTurn({
      snapshot: start.snapshot,
      snapshotVersion: ONBOARDING_MACHINE_VERSION,
      input: baseInput({ elapsedMinutes: 42 }),
      implementations: stubs(),
      event: { type: 'REPLY', text: 'yes' },
    });
    const ctx = (resumed.snapshot as { context: OnboardingContext }).context;
    expect(ctx.elapsedMinutes).toBe(42);
    expect(ctx.turnCount).toBe(1);
  });
});
