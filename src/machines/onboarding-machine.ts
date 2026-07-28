import { assign, fromPromise, setup } from 'xstate';
import type { OnboardingQuestionSource } from '#/lib/onboarding-session';
import type {
  OnboardingAnswers,
  OnboardingConsentEvaluation,
  OnboardingQuestions,
} from '#/types';

/**
 * How many times the agent will clarify before treating the reply as a
 * refusal. Consent must be affirmative: proceeding to collect background,
 * schedule, and career information on an unresolved signal is the wrong
 * default.
 */
export const CONSENT_CLARIFICATION_CAP = 2;

export type OnboardingInput = {
  onboardingId: number;
  courseId: number;
  userId: string;
  questions: OnboardingQuestions;
  source: OnboardingQuestionSource;
  answers: OnboardingAnswers;
};

export type OnboardingContext = OnboardingInput & {
  currentQuestionId: string | null;
  followUpCount: number;
  consentClarificationCount: number;
  turnCount: number;
  lastReply: string | null;
};

export type OnboardingEvent =
  | { type: 'REPLY'; text: string }
  | { type: 'PAUSE' }
  | { type: 'DELETE' };

export const onboardingMachine = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
    input: {} as OnboardingInput,
  },
  actors: {
    greet: fromPromise<string, { context: OnboardingContext }>(async () => ''),
    evaluateConsent: fromPromise<
      OnboardingConsentEvaluation,
      { context: OnboardingContext; reply: string }
    >(async () => ({ status: 'declined', reply: null })),
    signOff: fromPromise<string, { context: OnboardingContext }>(
      async () => '',
    ),
    declineConsent: fromPromise<void, { onboardingId: number }>(async () => {}),
  },
}).createMachine({
  id: 'onboarding',
  context: ({ input }) => ({
    ...input,
    currentQuestionId: null,
    followUpCount: 0,
    consentClarificationCount: 0,
    turnCount: 0,
    lastReply: null,
  }),
  initial: 'greeting',
  states: {
    greeting: {
      invoke: {
        src: 'greet',
        input: ({ context }) => ({ context }),
        onDone: { target: 'awaitingConsent' },
        onError: { target: 'failed' },
      },
    },

    awaitingConsent: {
      on: {
        REPLY: {
          target: 'evaluatingConsent',
          actions: assign({
            lastReply: ({ event }) => event.text,
            turnCount: ({ context }) => context.turnCount + 1,
          }),
        },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleted' },
      },
    },

    evaluatingConsent: {
      invoke: {
        src: 'evaluateConsent',
        input: ({ context }) => ({
          context,
          reply: context.lastReply ?? '',
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.status === 'consented',
            target: 'asking',
          },
          {
            // Under the cap: answer the question they raised, then re-ask.
            guard: ({ context, event }) =>
              event.output.status === 'needs_clarification' &&
              context.consentClarificationCount < CONSENT_CLARIFICATION_CAP,
            target: 'greeting',
            actions: assign({
              consentClarificationCount: ({ context }) =>
                context.consentClarificationCount + 1,
            }),
          },
          {
            // Declined, or clarification exhausted. Both are a no.
            target: 'signingOff',
          },
        ],
        onError: { target: 'failed' },
      },
    },

    signingOff: {
      invoke: {
        src: 'signOff',
        input: ({ context }) => ({ context }),
        onDone: { target: 'recordingDecline' },
        onError: { target: 'recordingDecline' },
      },
    },

    recordingDecline: {
      invoke: {
        src: 'declineConsent',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'consentDeclined' },
        onError: { target: 'failed' },
      },
    },

    // Filled in by the next task.
    asking: {},

    consentDeclined: { type: 'final' },
    paused: { type: 'final' },
    deleted: { type: 'final' },
    failed: { type: 'final' },
  },
});
