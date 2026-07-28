import type { OnboardingMessage } from '#/machines/onboarding-machine';

/** Status the client renders against. Derived from the machine's settled
 * state — the client must never infer state from message content. */
export type OnboardingStatus =
  | 'awaiting_consent'
  | 'awaiting_answer'
  | 'confirming'
  | 'complete'
  | 'declined'
  | 'deleted'
  | 'paused'
  | 'failed';

/** Actor status values this module cares about, matching XState's. */
type ActorStatus = 'active' | 'done' | 'error' | 'stopped';

/**
 * The machine states that expect user input. A turn is finished when the
 * machine reaches one of these, or when the actor is no longer active.
 *
 * Single source of truth on purpose: all three onboarding routes wait on
 * this definition, and if each decided independently they would drift — a
 * route treating a mid-flight state as settled would persist a snapshot
 * with a running invoke.
 */
export const WAITING_STATES = [
  'awaitingConsent',
  'awaitingAnswer',
  'confirming',
] as const;

const STATUS_BY_STATE: Record<string, OnboardingStatus> = {
  awaitingConsent: 'awaiting_consent',
  awaitingAnswer: 'awaiting_answer',
  confirming: 'confirming',
  complete: 'complete',
  consentDeclined: 'declined',
  deleted: 'deleted',
  paused: 'paused',
  failed: 'failed',
};

/**
 * Whether a turn has finished. Settledness comes from the actor status as
 * well as the state name: a final state stops the actor, and its state value
 * is whichever final state it landed in — so a name-only check would leave a
 * caller waiting forever on a completed interview.
 */
export const isSettled = (stateValue: string, status: ActorStatus): boolean =>
  status !== 'active' ||
  (WAITING_STATES as readonly string[]).includes(stateValue);

/**
 * The client-facing status for a settled machine. An unrecognised state maps
 * to 'failed' rather than to a plausible-looking status, so a state added to
 * the machine without updating this map surfaces loudly.
 */
export const toStatus = (
  stateValue: string,
  status: ActorStatus,
): OnboardingStatus => {
  if (status === 'error') return 'failed';
  return STATUS_BY_STATE[stateValue] ?? 'failed';
};

type MessageRowLike = {
  role: string;
  parts: unknown;
  order: number;
};

/**
 * Rows from course_onboarding_messages to the machine's transcript shape.
 * `parts` is untyped jsonb, so this reads defensively — a malformed row
 * degrades to empty text rather than crashing a whole session load.
 */
export const messageRowsToTranscript = (
  rows: MessageRowLike[],
): OnboardingMessage[] =>
  [...rows]
    .sort((a, b) => a.order - b.order)
    .map((row) => ({
      role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
      text: Array.isArray(row.parts)
        ? row.parts
            .filter(
              (p): p is { type: 'text'; text: string } =>
                typeof p === 'object' &&
                p !== null &&
                (p as { type?: unknown }).type === 'text' &&
                typeof (p as { text?: unknown }).text === 'string',
            )
            .map((p) => p.text)
            .join('')
        : '',
    }));

/**
 * Structurally compatible with `ai`'s UIMessage (id, role, parts), which is
 * what ChatWidgetMessages requires. Declared locally rather than importing
 * `ai` so this module stays cheap to import from a test; the client hook
 * asserts real compatibility at its own boundary.
 */
export type UIMessageLike = {
  id: string;
  role: 'assistant' | 'user';
  parts: { type: 'text'; text: string }[];
};

/** Transcript to the shape the existing chat components render. Ids are
 * index-based and prefixed so they cannot collide with Viper7's message ids. */
export const transcriptToUIMessages = (
  turns: OnboardingMessage[],
): UIMessageLike[] =>
  turns.map((turn, index) => ({
    id: `onboarding-${index}`,
    role: turn.role,
    parts: [{ type: 'text', text: turn.text }],
  }));
