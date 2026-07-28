import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import {
  CONSENT_CLARIFICATION_CAP,
  FOLLOW_UP_CAP,
  onboardingMachine,
} from '#/machines/onboarding-machine';
import type {
  OnboardingConsentEvaluation,
  OnboardingQuestions,
  OnboardingReplyEvaluation,
} from '#/types';

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
    // `asking` invokes askQuestion, which the default stub resolves
    // immediately — re-querying getSnapshot() here would race against that
    // invoke's onDone. Assert on the snapshot waitFor already resolved with.
    const snapshot = await waitFor(actor, (s) => s.matches('asking'));
    expect(snapshot.matches('asking')).toBe(true);
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
    // Same race as above: `asking` invokes askQuestion and can advance to
    // `awaitingAnswer` before a separate getSnapshot() call would run.
    const snapshot = await waitFor(actor, (s) => s.matches('asking'));
    expect(snapshot.matches('asking')).toBe(true);
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

  it('passes the clarification reply through to the next greeting', async () => {
    // The re-greet after "needs_clarification" is supposed to answer the
    // question the user raised, not repeat itself verbatim — that requires
    // the clarification text to survive the trip back through context.
    const queue = [unclear, consented];
    const greet = vi.fn(
      async ({ input }: { input: { context: OnboardingContext } }) => {
        void input;
        return 'Welcome — before we start…';
      },
    );

    const actor = createActor(
      onboardingMachine.provide({
        actors: {
          greet: fromPromise(greet),
          evaluateConsent: fromPromise(async () => {
            const next = queue.shift();
            if (!next)
              throw new Error('evaluateConsent called more than scripted');
            return next;
          }),
          signOff: fromPromise(
            async () => 'No problem at all. Enjoy the course.',
          ),
          declineConsent: fromPromise(async () => {}),
        },
      }),
      { input: INPUT },
    );

    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'what do you do with this?' });
    await waitFor(actor, (s) => s.context.consentClarificationCount === 1);
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'ok that makes sense' });
    await waitFor(actor, (s) => s.matches('asking'));

    expect(greet).toHaveBeenCalledTimes(2);
    const secondCallArgs = greet.mock.calls[1][0];
    expect(secondCallArgs.input.context.lastClarification).toBe(unclear.reply);
  });
});

/** Actor already past the consent gate, with scripted reply verdicts. */
function makeAnsweringActor(
  replyVerdicts: OnboardingReplyEvaluation[],
  questions = DEFAULT_ONBOARDING_QUESTIONS,
) {
  const queue = [...replyVerdicts];
  const saveAnswer = vi.fn(
    async (_args: {
      input: { onboardingId: number; questionId: string; answer: string };
    }) => {},
  );
  const completeOnboarding = vi.fn(async () => {});
  const deleteOnboarding = vi.fn(async () => {});
  const summarise = vi.fn(
    async (_args: { input: { context: OnboardingContext } }) =>
      "Here's what I heard…",
  );

  const actor = createActor(
    onboardingMachine.provide({
      actors: {
        greet: fromPromise(async () => 'Welcome…'),
        evaluateConsent: fromPromise<
          OnboardingConsentEvaluation,
          { context: OnboardingContext; reply: string }
        >(async () => ({
          status: 'consented',
          reply: null,
        })),
        signOff: fromPromise(async () => 'bye'),
        declineConsent: fromPromise(async () => {}),
        askQuestion: fromPromise(async () => 'So, tell me a bit about you?'),
        evaluateReply: fromPromise(async () => {
          const next = queue.shift();
          if (!next) throw new Error('evaluateReply called more than scripted');
          return next;
        }),
        saveAnswer: fromPromise(saveAnswer),
        summarise: fromPromise(summarise),
        completeOnboarding: fromPromise(completeOnboarding),
        deleteOnboarding: fromPromise(deleteOnboarding),
      },
    }),
    { input: { ...INPUT, questions } },
  );

  return { actor, saveAnswer, completeOnboarding, deleteOnboarding, summarise };
}

const answered = (answer: string): OnboardingReplyEvaluation => ({
  status: 'answered',
  answer,
  followUp: null,
  hesitancy: false,
});

const vague: OnboardingReplyEvaluation = {
  status: 'needs_follow_up',
  answer: null,
  followUp: 'Could you say a bit more?',
  hesitancy: false,
};

/** Drives the actor from start through the consent gate to the first question. */
async function reachAsking(
  actor: ReturnType<typeof makeAnsweringActor>['actor'],
) {
  actor.start();
  await waitFor(actor, (s) => s.matches('awaitingConsent'));
  actor.send({ type: 'REPLY', text: 'yes' });
  await waitFor(actor, (s) => s.matches('awaitingAnswer'));
}

describe('onboardingMachine — question loop', () => {
  const ONE: OnboardingQuestions = [{ id: 'q1', text: 'Only question?' }];

  it('asks the first pending question', async () => {
    const { actor } = makeAnsweringActor([answered('yes')], ONE);
    await reachAsking(actor);
    expect(actor.getSnapshot().context.currentQuestionId).toBe('q1');
  });

  it('persists an answer and completes when nothing is left pending', async () => {
    const { actor, saveAnswer, completeOnboarding } = makeAnsweringActor(
      [answered('Two years, mostly FPV.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'two years, mostly FPV' });
    await waitFor(actor, (s) => s.matches('confirming'));
    actor.send({ type: 'CONFIRM' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('complete')).toBe(true);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.answers).toEqual({
      q1: 'Two years, mostly FPV.',
    });
  });

  it('follows up on a vague reply without persisting an answer', async () => {
    const { actor, saveAnswer } = makeAnsweringActor(
      [vague, answered('Two years.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'a bit' });
    await waitFor(actor, (s) => s.context.followUpCount === 1);
    expect(saveAnswer).not.toHaveBeenCalled();
    await waitFor(actor, (s) => s.matches('awaitingAnswer'));
  });

  it('routes a vague reply through askingFollowUp and delivers the evaluator follow-up', async () => {
    // Defect A: `needs_follow_up` used to target `awaitingAnswer` directly,
    // invoking nothing — the evaluator's `followUp` text was discarded and
    // the agent said nothing. `askingFollowUp` must invoke `askQuestion`
    // again with `pendingFollowUp` set to that text.
    const askQuestion = vi.fn(
      async ({
        input,
      }: {
        input: { context: OnboardingContext; questionId: string };
      }) => input.context.pendingFollowUp ?? 'So, tell me a bit about you?',
    );

    const actor = createActor(
      onboardingMachine.provide({
        actors: {
          greet: fromPromise(async () => 'Welcome…'),
          evaluateConsent: fromPromise<
            OnboardingConsentEvaluation,
            { context: OnboardingContext; reply: string }
          >(async () => ({ status: 'consented', reply: null })),
          signOff: fromPromise(async () => 'bye'),
          declineConsent: fromPromise(async () => {}),
          askQuestion: fromPromise(askQuestion),
          evaluateReply: fromPromise(async () => vague),
          saveAnswer: fromPromise(async () => {}),
          summarise: fromPromise(async () => 'summary'),
          completeOnboarding: fromPromise(async () => {}),
          deleteOnboarding: fromPromise(async () => {}),
        },
      }),
      { input: { ...INPUT, questions: ONE } },
    );

    actor.start();
    await waitFor(actor, (s) => s.matches('awaitingConsent'));
    actor.send({ type: 'REPLY', text: 'yes' });
    await waitFor(actor, (s) => s.matches('awaitingAnswer'));
    actor.send({ type: 'REPLY', text: 'a bit' });
    await waitFor(
      actor,
      (s) =>
        s.matches('awaitingAnswer') &&
        s.context.pendingFollowUp === vague.followUp,
    );

    expect(askQuestion).toHaveBeenCalledTimes(2);
    const secondCallArgs = askQuestion.mock.calls[1][0];
    expect(secondCallArgs.input.context.pendingFollowUp).toBe(vague.followUp);
    expect(secondCallArgs.input.questionId).toBe('q1');
  });

  it('stops following up at the cap and takes the reply as the answer', async () => {
    // Without a cap, a user giving vague answers loops forever.
    const { actor, saveAnswer } = makeAnsweringActor(
      Array.from({ length: FOLLOW_UP_CAP + 1 }, () => vague),
      ONE,
    );
    await reachAsking(actor);
    for (let i = 0; i <= FOLLOW_UP_CAP; i++) {
      await waitFor(actor, (s) => s.matches('awaitingAnswer'));
      actor.send({ type: 'REPLY', text: 'dunno' });
      if (i < FOLLOW_UP_CAP) {
        await waitFor(actor, (s) => s.context.followUpCount === i + 1);
      }
    }
    await waitFor(actor, (_s) => saveAnswer.mock.calls.length === 1);
    expect(saveAnswer).toHaveBeenCalledTimes(1);
  });

  it('resets the follow-up count when moving to the next question', async () => {
    const TWO: OnboardingQuestions = [
      { id: 'q1', text: 'First?' },
      { id: 'q2', text: 'Second?' },
    ];
    const { actor } = makeAnsweringActor(
      [vague, answered('a'), answered('b')],
      TWO,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'hmm' });
    await waitFor(actor, (s) => s.context.followUpCount === 1);
    await waitFor(actor, (s) => s.matches('awaitingAnswer'));
    actor.send({ type: 'REPLY', text: 'ok here is more' });
    await waitFor(actor, (s) => s.context.currentQuestionId === 'q2');
    expect(actor.getSnapshot().context.followUpCount).toBe(0);
  });

  it('flags hesitancy from an evaluation and clears it once the next question starts', async () => {
    // Defect B: `hesitancy` was computed by evaluateReply and dropped —
    // `remindControls` could only ever come from `turnCount`. It must reach
    // context as `hesitancyFlagged`, and `selectNextQuestion` must clear it
    // so the reminder fires at most once per question.
    const TWO: OnboardingQuestions = [
      { id: 'q1', text: 'First?' },
      { id: 'q2', text: 'Second?' },
    ];
    const hesitantAnswer: OnboardingReplyEvaluation = {
      status: 'answered',
      answer: 'a',
      followUp: null,
      hesitancy: true,
    };
    const { actor } = makeAnsweringActor([hesitantAnswer, answered('b')], TWO);
    await reachAsking(actor);

    // Every stub here resolves instantly, so `persisting` (hesitancyFlagged
    // set, still on q1) and `asking` (cleared, now on q2) can both complete
    // within the same microtask flush that `waitFor`'s continuation runs in
    // — inspecting `getSnapshot()` after an `await` would race past the
    // intermediate state. Subscribing records every transition as it
    // happens, so the transient state can't be skipped.
    const snapshots: {
      questionId: string | null;
      hesitancyFlagged: boolean;
    }[] = [];
    const subscription = actor.subscribe((s) => {
      snapshots.push({
        questionId: s.context.currentQuestionId,
        hesitancyFlagged: s.context.hesitancyFlagged,
      });
    });

    actor.send({ type: 'REPLY', text: 'a' });
    await waitFor(actor, (s) => s.context.currentQuestionId === 'q2');
    subscription.unsubscribe();

    expect(
      snapshots.some(
        (s) => s.questionId === 'q1' && s.hesitancyFlagged === true,
      ),
    ).toBe(true);
    expect(actor.getSnapshot().context.hesitancyFlagged).toBe(false);
  });

  it('stores an empty string for a declined question so it never re-prompts', async () => {
    const { actor, saveAnswer } = makeAnsweringActor(
      [
        {
          status: 'declined',
          answer: null,
          followUp: null,
          hesitancy: true,
        },
      ],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: "I'd rather not say" });
    await waitFor(actor, (s) => s.matches('confirming'));
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    // Assert on what actually reached the persistence layer, not just that it
    // was called — a regression in persisting's input expression could still
    // call saveAnswer once while sending the wrong value.
    expect(saveAnswer.mock.calls[0][0].input).toEqual({
      onboardingId: INPUT.onboardingId,
      questionId: 'q1',
      answer: '',
    });
    expect(actor.getSnapshot().context.answers).toEqual({ q1: '' });
  });

  it('stores the actual reply as the answer once follow-ups are exhausted', async () => {
    // A capped-out reply must be taken as the answer, not discarded as an
    // empty string — an empty string is indistinguishable from a decline.
    const { actor } = makeAnsweringActor(
      Array.from({ length: FOLLOW_UP_CAP + 1 }, () => vague),
      ONE,
    );
    await reachAsking(actor);
    for (let i = 0; i <= FOLLOW_UP_CAP; i++) {
      await waitFor(actor, (s) => s.matches('awaitingAnswer'));
      const replyText = i === FOLLOW_UP_CAP ? 'about a year I think' : 'dunno';
      actor.send({ type: 'REPLY', text: replyText });
      if (i < FOLLOW_UP_CAP) {
        await waitFor(actor, (s) => s.context.followUpCount === i + 1);
      }
    }
    await waitFor(actor, (s) => s.matches('confirming'));
    expect(actor.getSnapshot().context.answers).toEqual({
      q1: 'about a year I think',
    });
  });

  it('pauses on request, leaving the row incomplete', async () => {
    const { actor, completeOnboarding } = makeAnsweringActor([], ONE);
    await reachAsking(actor);
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('deletes on request', async () => {
    const { actor, deleteOnboarding } = makeAnsweringActor([], ONE);
    await reachAsking(actor);
    actor.send({ type: 'DELETE' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(actor.getSnapshot().matches('deleted')).toBe(true);
    expect(deleteOnboarding).toHaveBeenCalledTimes(1);
  });

  it('re-summarises when the user corrects the summary', async () => {
    const { actor, completeOnboarding } = makeAnsweringActor(
      [answered('Two years.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'two years' });
    await waitFor(actor, (s) => s.matches('confirming'));
    actor.send({ type: 'REPLY', text: 'actually it was three years' });
    await waitFor(actor, (s) => s.matches('summarising'));
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('carries the correction text through to the next summarise call', async () => {
    // A correction sent from `confirming` must actually reach the
    // summariser — otherwise summarising re-runs against byte-identical
    // context, re-emits the same summary, and the user is stuck correcting
    // forever.
    const { actor, summarise } = makeAnsweringActor(
      [answered('Two years.')],
      ONE,
    );
    await reachAsking(actor);
    actor.send({ type: 'REPLY', text: 'two years' });
    await waitFor(actor, (s) => s.matches('confirming'));
    actor.send({ type: 'REPLY', text: 'actually it was three years' });
    await waitFor(actor, (s) => s.matches('confirming'));
    expect(summarise).toHaveBeenCalledTimes(2);
    const secondCallArgs = summarise.mock.calls[1][0];
    expect(secondCallArgs.input.context.lastReply).toBe(
      'actually it was three years',
    );
  });

  it('skips straight to summarising when every question is already answered', async () => {
    // The resume case: a returning user with a full answers map.
    const askQuestion = vi.fn(async () => 'q');
    const resumed = createActor(
      onboardingMachine.provide({
        actors: {
          greet: fromPromise(async () => 'Welcome back…'),
          evaluateConsent: fromPromise<
            OnboardingConsentEvaluation,
            { context: OnboardingContext; reply: string }
          >(async () => ({
            status: 'consented',
            reply: null,
          })),
          signOff: fromPromise(async () => 'bye'),
          declineConsent: fromPromise(async () => {}),
          askQuestion: fromPromise(askQuestion),
          evaluateReply: fromPromise(async () => answered('x')),
          saveAnswer: fromPromise(async () => {}),
          summarise: fromPromise(async () => 'summary'),
          completeOnboarding: fromPromise(async () => {}),
          deleteOnboarding: fromPromise(async () => {}),
        },
      }),
      { input: { ...INPUT, questions: ONE, answers: { q1: 'already done' } } },
    );
    resumed.start();
    await waitFor(resumed, (s) => s.matches('awaitingConsent'));
    resumed.send({ type: 'REPLY', text: 'yes' });
    await waitFor(resumed, (s) => s.matches('confirming'));
    expect(resumed.getSnapshot().matches('confirming')).toBe(true);
    // The point of this test: with everything already answered, `asking`
    // must bypass askQuestion entirely via its `always` transition — no
    // question should ever be asked on resume.
    expect(askQuestion).not.toHaveBeenCalled();
  });
});
