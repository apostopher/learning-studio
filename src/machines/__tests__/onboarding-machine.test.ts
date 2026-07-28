import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import {
  CONSENT_CLARIFICATION_CAP,
  onboardingMachine,
} from '#/machines/onboarding-machine';
import type { OnboardingConsentEvaluation } from '#/types';

const INPUT = {
  onboardingId: 1,
  courseId: 10,
  userId: 'user_1',
  questions: DEFAULT_ONBOARDING_QUESTIONS,
  source: 'default' as const,
  answers: {},
};

/**
 * Builds an actor with stubbed AI actors. `consentVerdicts` is consumed one
 * per evaluateConsent call, so a test can script a clarification loop.
 */
function makeActor(consentVerdicts: OnboardingConsentEvaluation[]) {
  const queue = [...consentVerdicts];
  const declineConsent = vi.fn(async () => {});

  const actor = createActor(
    onboardingMachine.provide({
      actors: {
        greet: fromPromise(async () => 'Welcome — before we start…'),
        evaluateConsent: fromPromise(async () => {
          const next = queue.shift();
          if (!next)
            throw new Error('evaluateConsent called more than scripted');
          return next;
        }),
        signOff: fromPromise(
          async () => 'No problem at all. Enjoy the course.',
        ),
        declineConsent: fromPromise(declineConsent),
      },
    }),
    { input: INPUT },
  );

  return { actor, declineConsent };
}

const consented: OnboardingConsentEvaluation = {
  status: 'consented',
  reply: null,
};
const declined: OnboardingConsentEvaluation = {
  status: 'declined',
  reply: null,
};
const unclear: OnboardingConsentEvaluation = {
  status: 'needs_clarification',
  reply: 'We only use it to pace the course.',
};

describe('onboardingMachine — consent gate', () => {
  it('waits for the user after greeting', async () => {
    const { actor } = makeActor([consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    expect(actor.getSnapshot().matches('awaitingConsent')).toBe(true);
  });

  it('proceeds to asking once consent is given', async () => {
    const { actor } = makeActor([consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'sure, go ahead' });
    await waitFor(actor, (s) => s.matches('asking'));
    expect(actor.getSnapshot().matches('asking')).toBe(true);
  });

  it('signs off and records the decline when consent is refused', async () => {
    const { actor, declineConsent } = makeActor([declined]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: "I'd rather not" });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('consentDeclined')).toBe(true);
    expect(declineConsent).toHaveBeenCalledTimes(1);
  });

  it('never asks a question and leaves answers empty when consent is refused', async () => {
    // This is the invariant the gate exists to guarantee.
    const { actor } = makeActor([declined]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'no thanks' });
    await waitFor(actor, (s) => s.status === 'done');
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.answers).toEqual({});
    expect(snapshot.context.currentQuestionId).toBeNull();
  });

  it('loops back to greeting for a clarification, then proceeds', async () => {
    const { actor } = makeActor([unclear, consented]);
    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'what do you do with this?' });
    await waitFor(actor, (s) => s.context.consentClarificationCount === 1);
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'ok that makes sense' });
    await waitFor(actor, (s) => s.matches('asking'));
    expect(actor.getSnapshot().matches('asking')).toBe(true);
  });

  it('treats a capped-out clarification loop as declined', async () => {
    // Consent must be affirmative — an unresolved signal is not a yes.
    const { actor, declineConsent } = makeActor(
      Array.from({ length: CONSENT_CLARIFICATION_CAP + 1 }, () => unclear),
    );
    actor.start();
    for (let i = 0; i <= CONSENT_CLARIFICATION_CAP; i++) {
      await waitFor(actor, (s) => s.matches('awaitingConsent'));
      actor.send({ type: 'REPLY', text: 'but why?' });
      if (i < CONSENT_CLARIFICATION_CAP) {
        await waitFor(
          actor,
          (s) => s.context.consentClarificationCount === i + 1,
        );
      }
    }
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('consentDeclined')).toBe(true);
    expect(declineConsent).toHaveBeenCalledTimes(1);
  });
});
