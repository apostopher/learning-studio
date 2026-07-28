import { assign, fromPromise, setup } from 'xstate';
import { pendingQuestions } from '#/lib/course-onboarding';
import type {
  OnboardingAnswers,
  OnboardingConsentEvaluation,
  OnboardingQuestions,
  OnboardingReplyEvaluation,
} from '#/types';

/**
 * How many times the agent will clarify before treating the reply as a
 * refusal. Consent must be affirmative: proceeding to collect background,
 * schedule, and career information on an unresolved signal is the wrong
 * default.
 */
export const CONSENT_CLARIFICATION_CAP = 2;

/**
 * How many follow-ups a single question gets before the reply is taken as the
 * answer. Without a cap, `needs_follow_up` loops forever on a user who keeps
 * answering vaguely, and the doc's 10-15 minute target is unenforceable.
 */
export const FOLLOW_UP_CAP = 2;

/**
 * Turn count standing in for the doc's ten-minute mark — roughly two turns per
 * question across a five-to-seven question set. Past it, the agent re-states
 * the stop/suspend/delete controls, at most once per question.
 */
export const HESITANCY_TURN_THRESHOLD = 12;

/**
 * How many recent transcript turns are kept in context. Bounds prompt size
 * for a long interview: every turn added to the transcript is echoed into
 * `evaluateReply` and `askQuestion`'s prompts, so an unbounded transcript
 * would grow those prompts (and the persisted machine snapshot) without
 * limit over a long-running session. 20 comfortably covers a follow-up
 * exchange on the current question plus the immediately preceding one.
 */
export const TRANSCRIPT_TURN_LIMIT = 20;

export type OnboardingMessage = { role: 'assistant' | 'user'; text: string };

/**
 * Appends a turn and trims to `TRANSCRIPT_TURN_LIMIT`, oldest first.
 */
const appendTranscript = (
  transcript: OnboardingMessage[],
  message: OnboardingMessage,
): OnboardingMessage[] =>
  [...transcript, message].slice(-TRANSCRIPT_TURN_LIMIT);

export type OnboardingInput = {
  onboardingId: number;
  questions: OnboardingQuestions;
  answers: OnboardingAnswers;
  /**
   * Seeds `context.transcript`. The caller populates this from
   * `loadOnboardingSession`'s `messages` on session resume; a fresh session
   * passes an empty array.
   */
  initialMessages: OnboardingMessage[];
};

export type OnboardingContext = Omit<OnboardingInput, 'initialMessages'> & {
  /**
   * Bounded (see `TRANSCRIPT_TURN_LIMIT`) turn-by-turn history of what was
   * actually said, in order. `lastReply` alone only ever holds the single
   * message being evaluated right now — it cannot express a multi-turn
   * exchange (e.g. a base question, a vague answer, a follow-up, and the
   * reply that narrows it). `evaluateReply` and `askQuestion` read this to
   * see the whole exchange, not just its last fragment.
   */
  transcript: OnboardingMessage[];
  currentQuestionId: string | null;
  followUpCount: number;
  consentClarificationCount: number;
  turnCount: number;
  lastReply: string | null;
  lastClarification: string | null;
  /**
   * The evaluator's own follow-up question, carried from `evaluating` into
   * `askingFollowUp` so `askQuestion` can deliver it verbatim instead of
   * re-asking the base question. Cleared by `selectNextQuestion` — it must
   * not survive past the question it was raised for.
   */
  pendingFollowUp: string | null;
  /**
   * Set from the most recent reply evaluation's `hesitancy` flag. Combined
   * with `turnCount` to decide `remindControls` in every actor's system
   * prompt.
   *
   * Deliberately NOT cleared by `selectNextQuestion`: that action is the
   * `entry` of `asking`, which runs *before* `askQuestion` is invoked for
   * the next question — clearing it there would mean no actor ever sees it
   * as `true`. It is cleared instead on `askQuestion`'s `onDone` (in both
   * `asking` and `askingFollowUp`), once the turn that could actually carry
   * the reminder has been produced. That gives "reminded once per hesitancy
   * signal" rather than "reminded on every turn until the next question."
   *
   * On the *final* question, `asking`'s `always` guard routes straight to
   * `summarising` without ever invoking `askQuestion` — so that onDone never
   * runs. `summarising`'s own `onDone` clears it too, for exactly this path.
   */
  hesitancyFlagged: boolean;
  /**
   * Set from the reply text when the trainee corrects the summary from
   * `confirming`, so `summarise` can incorporate that correction into the
   * next reflect-back instead of silently re-emitting the same summary.
   * Cleared on `summarising`'s `onDone` — it must apply to exactly the one
   * re-summary it was raised for, not linger into later corrections.
   */
  pendingCorrection: string | null;
};

export type OnboardingEvent =
  | { type: 'REPLY'; text: string }
  | { type: 'CONFIRM' }
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
    askQuestion: fromPromise<
      string,
      { context: OnboardingContext; questionId: string }
    >(async () => ''),
    evaluateReply: fromPromise<
      OnboardingReplyEvaluation,
      { context: OnboardingContext; questionId: string; reply: string }
    >(async () => ({
      status: 'needs_follow_up',
      answer: null,
      followUp: null,
      hesitancy: false,
    })),
    saveAnswer: fromPromise<
      void,
      { onboardingId: number; questionId: string; answer: string }
    >(async () => {}),
    summarise: fromPromise<string, { context: OnboardingContext }>(
      async () => '',
    ),
    completeOnboarding: fromPromise<void, { onboardingId: number }>(
      async () => {},
    ),
    deleteOnboarding: fromPromise<void, { onboardingId: number }>(
      async () => {},
    ),
  },
  actions: {
    /**
     * currentQuestionId is DERIVED, never independently tracked — it is always
     * the head of pendingQuestions(). That is what stops the machine drifting
     * from persisted state when a session resumes.
     */
    selectNextQuestion: assign({
      currentQuestionId: ({ context }) =>
        pendingQuestions(context.questions, context.answers)[0]?.id ?? null,
      followUpCount: 0,
      pendingFollowUp: null,
    }),
  },
}).createMachine({
  id: 'onboarding',
  context: ({ input }) => ({
    onboardingId: input.onboardingId,
    questions: input.questions,
    answers: input.answers,
    transcript: input.initialMessages.slice(-TRANSCRIPT_TURN_LIMIT),
    currentQuestionId: null,
    followUpCount: 0,
    consentClarificationCount: 0,
    turnCount: 0,
    lastReply: null,
    lastClarification: null,
    pendingFollowUp: null,
    hesitancyFlagged: false,
    pendingCorrection: null,
  }),
  initial: 'greeting',
  states: {
    greeting: {
      invoke: {
        src: 'greet',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'awaitingConsent',
          actions: assign({
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'assistant',
                text: event.output,
              }),
          }),
        },
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
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'user',
                text: event.text,
              }),
          }),
        },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
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
              // `reply` is schema-nullable on every status. When null, fall
              // back to the trainee's own words rather than leaving
              // `lastClarification` at its previous value (null on the first
              // clarification) — otherwise `greet` takes its first-message
              // branch and re-emits the identical opening verbatim.
              lastClarification: ({ context, event }) =>
                event.output.reply ?? context.lastReply,
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
        onDone: {
          target: 'recordingDecline',
          actions: assign({
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'assistant',
                text: event.output,
              }),
          }),
        },
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

    asking: {
      entry: 'selectNextQuestion',
      always: [
        {
          guard: ({ context }) => context.currentQuestionId === null,
          target: 'summarising',
        },
      ],
      invoke: {
        src: 'askQuestion',
        input: ({ context }) => ({
          context,
          questionId: context.currentQuestionId ?? '',
        }),
        onDone: {
          target: 'awaitingAnswer',
          actions: assign({
            // The reminder (if any) has now been woven into the turn
            // `askQuestion` just produced — clear it so it isn't repeated on
            // every subsequent turn of this same question.
            hesitancyFlagged: false,
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'assistant',
                text: event.output,
              }),
          }),
        },
        onError: { target: 'failed' },
      },
    },

    awaitingAnswer: {
      on: {
        REPLY: {
          target: 'evaluating',
          actions: assign({
            lastReply: ({ event }) => event.text,
            turnCount: ({ context }) => context.turnCount + 1,
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'user',
                text: event.text,
              }),
          }),
        },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
      },
    },

    evaluating: {
      invoke: {
        src: 'evaluateReply',
        input: ({ context }) => ({
          context,
          questionId: context.currentQuestionId ?? '',
          reply: context.lastReply ?? '',
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.status === 'wants_pause',
            target: 'paused',
          },
          {
            guard: ({ event }) => event.output.status === 'wants_delete',
            target: 'deleting',
          },
          {
            guard: ({ context, event }) =>
              event.output.status === 'needs_follow_up' &&
              context.followUpCount < FOLLOW_UP_CAP,
            target: 'askingFollowUp',
            actions: assign({
              followUpCount: ({ context }) => context.followUpCount + 1,
              pendingFollowUp: ({ event }) => event.output.followUp,
              hesitancyFlagged: ({ event }) => event.output.hesitancy,
            }),
          },
          {
            // answered, declined, or follow-ups exhausted. A declined question
            // stores an empty string — a present key counts as answered, so it
            // never re-prompts. An exhausted follow-up takes the user's actual
            // reply as the answer rather than discarding it as an empty
            // string.
            //
            // `''` is only ever a legitimate answer for `declined` — the
            // schema leaves `answer` nullable on every status with no
            // per-status constraint, so a schema-legal
            // `{status:'answered', answer:null}` must NOT fall through to
            // `''`: that would both discard what the trainee said and
            // misreport them to themselves (via `summarise`) as having
            // refused. Key on `declined` specifically and otherwise fall
            // back to `lastReply`, which also correctly covers the
            // exhausted-follow-up case above.
            target: 'persisting',
            actions: assign({
              answers: ({ context, event }) => ({
                ...context.answers,
                [context.currentQuestionId ?? '']:
                  event.output.status === 'declined'
                    ? ''
                    : (event.output.answer ?? context.lastReply ?? ''),
              }),
              hesitancyFlagged: ({ event }) => event.output.hesitancy,
            }),
          },
        ],
        onError: { target: 'failed' },
      },
    },

    // Delivers the evaluator's own follow-up question. Deliberately has no
    // `entry: 'selectNextQuestion'` — that would reset followUpCount and
    // make the follow-up loop unbounded, defeating FOLLOW_UP_CAP.
    askingFollowUp: {
      invoke: {
        src: 'askQuestion',
        input: ({ context }) => ({
          context,
          questionId: context.currentQuestionId ?? '',
        }),
        onDone: {
          target: 'awaitingAnswer',
          actions: assign({
            // Same reasoning as `asking`'s onDone: the reminder has now been
            // delivered as part of this follow-up turn.
            hesitancyFlagged: false,
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'assistant',
                text: event.output,
              }),
          }),
        },
        onError: { target: 'failed' },
      },
    },

    persisting: {
      invoke: {
        src: 'saveAnswer',
        input: ({ context }) => ({
          onboardingId: context.onboardingId,
          questionId: context.currentQuestionId ?? '',
          answer: context.answers[context.currentQuestionId ?? ''] ?? '',
        }),
        onDone: { target: 'asking' },
        onError: { target: 'failed' },
      },
    },

    summarising: {
      invoke: {
        src: 'summarise',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'confirming',
          actions: assign({
            // The correction (if any) has now been folded into the summary
            // `summarise` just produced — clear it so it applies to exactly
            // this one re-summary, not to whatever the trainee says next.
            pendingCorrection: null,
            // `asking`'s `always` guard reaches `summarising` on the final
            // question *without* invoking `askQuestion` (there is no more
            // question to ask), so `askQuestion`'s onDone — the only other
            // place this is cleared — never runs on that path. Left
            // uncleared here, it stays true through every re-summary and
            // into `completing`, making `remindControls` true on every
            // closing turn regardless of how the trainee is actually doing.
            hesitancyFlagged: false,
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'assistant',
                text: event.output,
              }),
          }),
        },
        onError: { target: 'failed' },
      },
    },

    confirming: {
      on: {
        REPLY: {
          target: 'summarising',
          actions: assign({
            lastReply: ({ event }) => event.text,
            turnCount: ({ context }) => context.turnCount + 1,
            pendingCorrection: ({ event }) => event.text,
            transcript: ({ context, event }) =>
              appendTranscript(context.transcript, {
                role: 'user',
                text: event.text,
              }),
          }),
        },
        CONFIRM: { target: 'completing' },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
      },
    },

    completing: {
      invoke: {
        src: 'completeOnboarding',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'complete' },
        onError: { target: 'failed' },
      },
    },

    deleting: {
      invoke: {
        src: 'deleteOnboarding',
        input: ({ context }) => ({ onboardingId: context.onboardingId }),
        onDone: { target: 'deleted' },
        onError: { target: 'failed' },
      },
    },

    consentDeclined: { type: 'final' },
    paused: { type: 'final' },
    deleted: { type: 'final' },
    complete: { type: 'final' },
    failed: { type: 'final' },
  },
});
