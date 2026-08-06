import { assign, fromPromise, setup } from 'xstate';
import { pendingQuestions } from '#/lib/course-onboarding';
import type {
  FlatOnboardingQuestion,
  OnboardingAnswers,
  OnboardingConsentEvaluation,
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
 * Turn-count backstop for "this conversation is running long" — roughly two
 * turns per question across a five-to-seven question set.
 *
 * A backstop, not the primary signal: docs/onboarding.md keys the re-offer on
 * TEN MINUTES, and turns are a poor proxy for that (a verbose trainee reaches
 * 12 turns in four minutes, a terse one may take twenty). Both are checked —
 * see `shouldRemindControls`.
 */
export const HESITANCY_TURN_THRESHOLD = 12;

/** The doc's actual signal: "Repeat this option briefly if the conversation
 * runs more than 10 minutes" (docs/onboarding.md). */
export const LONG_CONVERSATION_MINUTES = 10;

/**
 * Turns of silence before the long-conversation reminder may fire again.
 *
 * Without this the reminder LATCHES: `turnCount` only ever increases, so
 * `turnCount >= HESITANCY_TURN_THRESHOLD` is true for every remaining turn of
 * the interview once crossed, and the agent re-states the controls before
 * every single question from that point on. The doc says "repeat briefly",
 * not "repeat forever".
 */
export const CONTROLS_REMINDER_COOLDOWN_TURNS = 6;

/**
 * How many recent transcript turns are kept in context. Bounds prompt size
 * for a long interview: every turn added to the transcript is echoed into
 * `evaluateReply` and `askQuestion`'s prompts, so an unbounded transcript
 * would grow those prompts (and the persisted machine snapshot) without
 * limit over a long-running session. 20 comfortably covers a follow-up
 * exchange on the current question plus the immediately preceding one.
 */
export const TRANSCRIPT_TURN_LIMIT = 20;

/**
 * Bump this whenever the machine's state names or context shape change.
 * A persisted snapshot whose version differs is discarded rather than
 * restored — see machineVersion in src/db/schema.ts for why that is safe.
 *
 * The version expresses intent; onboarding-runner.ts additionally wraps
 * restoration in a try/catch, so a shape change that slips through without a
 * bump still degrades to a fresh start rather than throwing.
 */
// '2': context gained `elapsedMinutes` and `lastRemindedTurn` when the
// controls reminder was changed from a permanent latch to a cooled-down
// re-offer. A v1 snapshot has neither field, so restoring one would leave
// `lastRemindedTurn` undefined and reinstate the latch for that session.
// '3': `profiling` inserted between `confirming` and `completing`. A v2
// snapshot is in practice still restorable (the new state sits past the point
// any waiting snapshot can be parked at), but the guard is deliberately
// biased toward discarding, and the cost of discarding is one session
// resuming from its durable answers.
export const ONBOARDING_MACHINE_VERSION = '3';

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
  /**
   * FLAT and already ordered — category order, then question order within each
   * category, produced by `flattenQuestions`. The machine deliberately never
   * sees the nested category structure: `pendingQuestions`,
   * `selectNextQuestion`, the `answers` map and snapshot resume all predate
   * categories and keep working unchanged against a flat list. Each entry
   * carries `categoryId`/`categoryName` so `askQuestion` can detect a category
   * boundary without the machine needing to model categories at all.
   */
  questions: FlatOnboardingQuestion[];
  answers: OnboardingAnswers;
  /**
   * Seeds `context.transcript`. The caller populates this from
   * `loadOnboardingSession`'s `messages` on session resume; a fresh session
   * passes an empty array.
   */
  initialMessages: OnboardingMessage[];
  /**
   * Wall-clock minutes since this onboarding session began, computed by the
   * caller from `course_onboarding.created_at`.
   *
   * Passed IN rather than read from a clock inside the machine, for two
   * reasons: the machine stays pure (so tests can drive elapsed time directly
   * instead of waiting or faking timers), and it is recomputed from the durable
   * row on every request, so it survives pause/resume across separate HTTP
   * calls where an in-context counter would not.
   */
  elapsedMinutes: number;
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
  /**
   * `turnCount` at the moment a turn last carried the controls reminder, or
   * null if it has never been given.
   *
   * This is what stops the long-conversation reminder latching. The
   * "conversation is running long" condition is LEVEL-triggered on
   * monotonically increasing inputs (`turnCount` never decreases, elapsed time
   * never decreases), so once true it is true forever. Recording when the
   * reminder was last delivered converts it into an edge: it fires, then stays
   * quiet for `CONTROLS_REMINDER_COOLDOWN_TURNS`.
   *
   * Written wherever `hesitancyFlagged` is cleared — the same three sites, for
   * the same reason: those are the points at which a produced turn has
   * actually carried the reminder.
   */
  lastRemindedTurn: number | null;
};

/**
 * Whether this turn should re-state the stop/suspend/delete controls.
 *
 * ONE definition, called by all six actors. It used to be an expression
 * copy-pasted into each of them, which is how the latch below survived: fixing
 * it meant finding six identical lines.
 *
 * Two independent triggers:
 *
 * - **Hesitancy** fires every time, uncooled. It is already edge-triggered by
 *   construction — the evaluator sets `hesitancyFlagged`, the turn that
 *   carries the reminder clears it — and it is a direct response to something
 *   the trainee just did, so suppressing it would be wrong.
 * - **A long conversation** is cooled down. Both of its inputs only ever
 *   increase, so without `lastRemindedTurn` this returns true for every
 *   remaining turn of the interview and the agent nags before every question.
 */
export const shouldRemindControls = (context: {
  turnCount: number;
  elapsedMinutes: number;
  hesitancyFlagged: boolean;
  lastRemindedTurn: number | null;
}): boolean => {
  if (context.hesitancyFlagged) return true;

  const runningLong =
    context.turnCount >= HESITANCY_TURN_THRESHOLD ||
    context.elapsedMinutes >= LONG_CONVERSATION_MINUTES;
  if (!runningLong) return false;

  return (
    context.lastRemindedTurn === null ||
    context.turnCount - context.lastRemindedTurn >=
      CONTROLS_REMINDER_COOLDOWN_TURNS
  );
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
    generateSkaProfile: fromPromise<void, { context: OnboardingContext }>(
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
    elapsedMinutes: input.elapsedMinutes,
    currentQuestionId: null,
    followUpCount: 0,
    consentClarificationCount: 0,
    turnCount: 0,
    lastReply: null,
    lastClarification: null,
    pendingFollowUp: null,
    hesitancyFlagged: false,
    pendingCorrection: null,
    lastRemindedTurn: null,
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
            // Start the cooldown, so the long-conversation trigger (whose
            // inputs only ever increase) cannot re-fire on the very next turn.
            lastRemindedTurn: ({ context }) =>
              shouldRemindControls(context)
                ? context.turnCount
                : context.lastRemindedTurn,
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
            lastRemindedTurn: ({ context }) =>
              shouldRemindControls(context)
                ? context.turnCount
                : context.lastRemindedTurn,
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
            lastRemindedTurn: ({ context }) =>
              shouldRemindControls(context)
                ? context.turnCount
                : context.lastRemindedTurn,
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
        CONFIRM: { target: 'profiling' },
        PAUSE: { target: 'paused' },
        DELETE: { target: 'deleting' },
      },
    },

    /**
     * Distils the interview into the trainee's SKA profile, between accepting
     * the summary and stamping completion.
     *
     * BEST-EFFORT, and uniquely so: both `onDone` and `onError` go to
     * `completing`, where every other invoke in this machine routes its error
     * to `failed`. That asymmetry is deliberate. By the time this runs, the
     * answers and the transcript — the expensive, irreplaceable things the
     * trainee just spent fifteen minutes producing — are already durable. The
     * profile is derived from them and can be produced again at any time.
     * Routing to `failed` here would discard a finished interview to protect a
     * reproducible artifact, and would strand the trainee: they cannot fix a
     * provider outage by re-answering questions, and `failed` offers them no
     * action at all.
     *
     * So a profile-less completed onboarding is a legitimate permanent state,
     * and every reader downstream treats "no profile" as normal rather than as
     * an error. The actor itself already swallows generation failure (see
     * `generateSkaProfileWithRetry`); `onError` catches the rest — a DB write
     * failing, most plausibly.
     */
    profiling: {
      invoke: {
        src: 'generateSkaProfile',
        input: ({ context }) => ({ context }),
        onDone: { target: 'completing' },
        onError: { target: 'completing' },
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
