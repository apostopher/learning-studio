# Tavus Video Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A video-call button in the Viper7 chat window that puts the learner on a live Tavus call with a replica that speaks as Viper7, using our own chat brain.

**Architecture:** Tavus supplies face, voice and turn-taking; its persona's custom-LLM layer calls our OpenAI-compatible `/api/tavus/v1/chat/completions`, which identifies the call by the `conversation-id` header, rebuilds context (persona, course, gating, SKA profile, prior chat) and streams `buildChatStream` output back as OpenAI SSE. A `video_calls` table enforces 10 min/call, 30 min/day (UTC), one active call per user; transcripts are pulled from Tavus after the call and appended to the chat. The client drives the call with `@daily-co/daily-js` (no iframe) inside the chat window, with a pop-out floating window.

**Tech Stack:** TanStack Start server routes, Drizzle (node-postgres), AI SDK 6 (`streamText`), zod 4, jotai, TanStack Query, Base UI, Motion, `@daily-co/daily-js`, `date-fns` + `@date-fns/utc`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-tavus-video-call-design.md` — read it first; this plan argues from it.

## Global Constraints

- Limits: `PER_CALL_LIMIT_SECONDS = 600`, `DAILY_LIMIT_SECONDS = 1800`, `MIN_START_SECONDS = 60`, warning at 60 s left; day boundary 00:00 **UTC**; one active call per user.
- Video button only in **Viper7** mode, never onboarding.
- Perception messages (`<user_appearance>`, `<user_emotions>`, `<user_screen>`) never reach the model, logs or DB.
- `TAVUS_API_KEY` and `TAVUS_LLM_SECRET` never reach the browser. Only `.server.ts` modules and server route handlers import `#/lib/tavus.server`.
- Imports use `#/…` (vitest cannot resolve `@/`). Test files start with `// @vitest-environment node` (server) — UI tests stay on pure functions (dup-React under vitest breaks hooks).
- Tests assert on what the consumer received (`vi.fn()` call args), not on stored state (repo CLAUDE.md "Testing").
- CSS: logical properties / Tailwind logical utilities only (`ms-`, `pe-`, `start-`, `inset-inline`…). Colors only from the token classes already in use (`bg-gray-*`, `text-primary|secondary`, `bg-error-9` + `text-black`, `bg-warning-3` + `text-warning-text`, `text-accent-text`).
- State: jotai atoms + TanStack Query; no `useState`/`useReducer`; no `useEffect` for data fetching (docs/use-effect-rules.md).
- Schema changes go in through a hand-written idempotent script, **never** `pnpm db:push` (it offers to truncate `docs`).
- New deps respect the 7-day minimum release age: `@daily-co/daily-js@0.92.2`, `@date-fns/utc@2.1.1`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017aiZvALoGrwE1EHEwdrRuq
  ```

## Review Focus

1. **Speculative-inference aborts.** Tavus fires overlapping completion requests and cancels most of them. An aborted request must not log an error, send the fallback line, or keep generating. → test in Task 5 (`aborted signal: no onError, no fallback`).
2. **A learner who closed the tab mid-call tries again.** Their row is still `active`; they must be able to start a new call as soon as Tavus has ended the old one (≈30 s), not after the 12-minute stale window. → test in Task 9 (`start proceeds when the leftover active call has ended at Tavus`).
3. **Another user's call id.** Status and end for a call id the session doesn't own must 404 without touching Tavus. → tests in Task 9.
4. **Midnight UTC.** At 00:01 UTC the day's usage query must start at today's 00:00 UTC, so yesterday's calls don't count. → test in Task 9 (`listCallsSince is queried from 00:00 UTC today`).
5. **A completion request with no user turn yet** (Tavus can call before the learner speaks). Must answer with a short spoken line without calling the model. → test in Task 7.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/lib/video-call-contract.ts` | Shared client/server contract: limits, zod response schemas, reason enums |
| `src/lib/video-call-allowance.ts` | Pure usage math (UTC day window, remaining, stale, duration clamp) |
| `src/lib/video-call-copy.ts` | Pure user-facing strings and time formatting |
| `src/env.ts` (modify) | Tavus env vars |
| `src/lib/tavus.server.ts` | Tavus REST client (create/end/get conversation) |
| `src/lib/secret-matches.server.ts` | Timing-safe secret compare |
| `src/db/schema.ts` (modify) | `videoCalls` table |
| `src/db/migrate-video-calls.ts` | Idempotent DDL script |
| `src/db/video-calls.ts` | `video_calls` queries |
| `src/db/chat.ts` (modify) | `appendMessages` accepts a transaction executor |
| `src/lib/tavus-messages.ts` | Pure Tavus payload interpretation (clean messages, transcript → chat messages, shutdown reason) |
| `src/lib/openai-sse.ts` | Text stream → OpenAI `chat.completion.chunk` SSE |
| `src/ai/prompts/voice-mode.ts` | Voice prompt + fixed spoken lines |
| `src/ai/chat.ts` (modify) | `voice` + `abortSignal` options |
| `src/routes/api/tavus/v1/chat/completions.ts` | The brain endpoint Tavus calls |
| `src/lib/video-call-reconcile.server.ts` | Sync one call with Tavus; save transcript once |
| `src/lib/video-call-service.server.ts` | Allowance/active-call orchestration + response builders |
| `src/routes/api/video-call.ts` | `POST` start |
| `src/routes/api/video-call.allowance.ts` | `GET` allowance |
| `src/routes/api/video-call.$id.ts` | `GET` status |
| `src/routes/api/video-call.$id.end.ts` | `POST` end |
| `src/routes/api/tavus/webhook.ts` | Tavus `callback_url` |
| `scripts/tavus-sync-persona.ts` | Create/update the environment's Tavus persona |
| `src/components/chat-widget/use-chat-window-geometry.ts` (modify) | Rect atom + default rect as parameters; `computeDefaultVideoRect` |
| `src/atoms/video-call.ts` | Call state atoms, ticking `nowAtom`, `wideViewportAtom` |
| `src/data-hooks/keys.ts`, `src/data-hooks/use-video-call.ts`, `src/data-hooks/use-chat-messages.ts` (modify) | Query hooks + exported fetchers |
| `src/components/chat-widget/use-chat-widget.ts` (modify) | Expose `setMessages`, `getChatId`, `adoptChatId`, `courseSlug` |
| `src/components/video-call/*.tsx` | Presentational: controls, stage, window, on-call bar, warning, transcript line; containers: countdown, controller hook |
| `src/components/chat-widget/chat-widget-header.tsx`, `chat-window.tsx`, `chat-widget.tsx` (modify) | Wire the video call in |

---

### Task 1: Shared contract, usage math and copy

**Files:**
- Create: `src/lib/video-call-contract.ts`, `src/lib/video-call-allowance.ts`, `src/lib/video-call-copy.ts`
- Test: `src/lib/__tests__/video-call-allowance.test.ts`, `src/lib/__tests__/video-call-copy.test.ts`

**Interfaces:**
- Produces: constants `PER_CALL_LIMIT_SECONDS`, `DAILY_LIMIT_SECONDS`, `MIN_START_SECONDS`, `WARNING_AT_SECONDS`; schemas `allowanceResponseSchema`, `startRequestSchema`, `startResponseSchema`, `startErrorResponseSchema`, `statusResponseSchema`; types `VideoCallUnavailableReason`, `VideoCallStartErrorReason`, `VideoCallEndReason`, `AllowanceResponse`, `StartRequest`, `StartResponse`, `VideoCallStatusResponse`.
- Produces: `utcDayWindow(now: Date): { start: Date; resetsAt: Date }`, `usedSeconds(rows: UsageRow[]): number`, `computeAllowance(rows: UsageRow[], now: Date): Allowance`, `clampDuration(startedAt: Date, endedAt: Date, reservedSeconds: number): number`, `isStale(row: { startedAt: Date; reservedSeconds: number }, now: Date): boolean`, `STALE_GRACE_SECONDS`.
- Produces: `formatCountdown(seconds: number): string`, `formatCallDuration(seconds: number): string`, `callEndedLabel(durationSeconds: number | null, endReason: VideoCallEndReason | null): string`, `secondsUntil(iso: string, nowMs: number): number`, `videoButtonLabel(input: VideoButtonLabelInput): string`, `callErrorMessage(reason: VideoCallErrorReason, resetsAt: string | null): string`, type `VideoCallErrorReason`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @daily-co/daily-js@0.92.2 @date-fns/utc@2.1.1
```
Expected: both added to `dependencies`. (Daily is used in Task 14; installing now keeps package changes in one commit.)

- [ ] **Step 2: Write the contract module**

`src/lib/video-call-contract.ts`:
```ts
import { z } from 'zod';

/**
 * The client/server contract for Tavus video calls — limits, reasons and
 * response shapes. Imported by both route handlers and data hooks, so it must
 * stay free of server-only imports.
 */

export const PER_CALL_LIMIT_SECONDS = 600;
export const DAILY_LIMIT_SECONDS = 1800;
/** Below this much time left today, a call isn't worth starting. */
export const MIN_START_SECONDS = 60;
/** When the "1 minute left" banner appears. */
export const WARNING_AT_SECONDS = 60;

export const videoCallUnavailableReasonSchema = z.enum([
  'daily_limit',
  'already_active',
  'not_configured',
]);
export type VideoCallUnavailableReason = z.infer<
  typeof videoCallUnavailableReasonSchema
>;

export const videoCallStartErrorReasonSchema = z.enum([
  'daily_limit',
  'already_active',
  'not_configured',
  'provider_unavailable',
]);
export type VideoCallStartErrorReason = z.infer<
  typeof videoCallStartErrorReasonSchema
>;

export const videoCallEndReasonSchema = z.enum([
  'user',
  'time_limit',
  'left',
  'error',
  'stale',
]);
export type VideoCallEndReason = z.infer<typeof videoCallEndReasonSchema>;

export const allowanceResponseSchema = z.object({
  canStart: z.boolean(),
  reason: videoCallUnavailableReasonSchema.nullable(),
  remainingSeconds: z.number().int().nonnegative(),
  resetsAt: z.iso.datetime(),
  activeCallId: z.string().nullable(),
});
export type AllowanceResponse = z.infer<typeof allowanceResponseSchema>;

export const startRequestSchema = z.object({
  chatId: z.string().min(1).optional(),
  courseSlug: z.string().min(1).optional(),
});
export type StartRequest = z.infer<typeof startRequestSchema>;

export const startResponseSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  conversationUrl: z.url(),
  endsAt: z.iso.datetime(),
});
export type StartResponse = z.infer<typeof startResponseSchema>;

export const startErrorResponseSchema = z.object({
  reason: videoCallStartErrorReasonSchema,
  resetsAt: z.iso.datetime().optional(),
});

export const statusResponseSchema = z.object({
  status: z.enum(['active', 'ended']),
  endReason: videoCallEndReasonSchema.nullable(),
  durationSeconds: z.number().int().nullable(),
  transcriptSaved: z.boolean(),
  chatId: z.string(),
});
export type VideoCallStatusResponse = z.infer<typeof statusResponseSchema>;
```

- [ ] **Step 3: Write the failing allowance tests**

`src/lib/__tests__/video-call-allowance.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampDuration,
  computeAllowance,
  isStale,
  utcDayWindow,
} from '#/lib/video-call-allowance';

const at = (iso: string) => new Date(iso);

describe('utcDayWindow', () => {
  it('starts at 00:00 UTC today and resets at 00:00 UTC tomorrow', () => {
    const { start, resetsAt } = utcDayWindow(at('2026-10-07T00:01:00Z'));
    expect(start.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(resetsAt.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });
});

describe('computeAllowance', () => {
  const now = at('2026-10-06T12:00:00Z');

  it('gives a fresh user the full day and a 10 minute call', () => {
    const a = computeAllowance([], now);
    expect(a).toMatchObject({
      remainingSeconds: 1800,
      canStart: true,
      reservedSecondsIfStarted: 600,
    });
    expect(a.resetsAt.toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('counts ended calls by actual duration and active calls by reservation', () => {
    const a = computeAllowance(
      [
        { status: 'ended', reservedSeconds: 600, durationSeconds: 200 },
        { status: 'active', reservedSeconds: 600, durationSeconds: null },
      ],
      now,
    );
    expect(a.remainingSeconds).toBe(1000);
    expect(a.reservedSecondsIfStarted).toBe(600);
  });

  it('caps the next call at what is left today', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 1500 }],
      now,
    );
    expect(a.reservedSecondsIfStarted).toBe(300);
  });

  it('refuses a start with under a minute left', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 1750 }],
      now,
    );
    expect(a).toMatchObject({ remainingSeconds: 50, canStart: false });
  });

  it('never goes negative', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 4000 }],
      now,
    );
    expect(a.remainingSeconds).toBe(0);
  });
});

describe('clampDuration', () => {
  it('clamps to [0, reserved]', () => {
    const start = at('2026-10-06T12:00:00Z');
    expect(clampDuration(start, at('2026-10-06T12:01:30Z'), 600)).toBe(90);
    expect(clampDuration(start, at('2026-10-06T12:30:00Z'), 600)).toBe(600);
    expect(clampDuration(start, at('2026-10-06T11:59:00Z'), 600)).toBe(0);
  });
});

describe('isStale', () => {
  it('is stale only after reservation plus a 2 minute grace', () => {
    const row = { startedAt: at('2026-10-06T12:00:00Z'), reservedSeconds: 600 };
    expect(isStale(row, at('2026-10-06T12:12:00Z'))).toBe(false);
    expect(isStale(row, at('2026-10-06T12:12:01Z'))).toBe(true);
  });
});
```

- [ ] **Step 4: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/video-call-allowance.test.ts`
Expected: FAIL — cannot resolve `#/lib/video-call-allowance`.

- [ ] **Step 5: Implement the allowance math**

`src/lib/video-call-allowance.ts`:
```ts
import { utc } from '@date-fns/utc';
import { addDays, differenceInSeconds, startOfDay } from 'date-fns';
import {
  DAILY_LIMIT_SECONDS,
  MIN_START_SECONDS,
  PER_CALL_LIMIT_SECONDS,
} from '#/lib/video-call-contract';

/** How long past its reservation an `active` row may sit before it's treated
 * as abandoned (Tavus normally ends it within 30 s of the learner leaving). */
export const STALE_GRACE_SECONDS = 120;

export interface UsageRow {
  status: 'active' | 'ended';
  reservedSeconds: number;
  durationSeconds: number | null;
}

export interface Allowance {
  remainingSeconds: number;
  resetsAt: Date;
  canStart: boolean;
  reservedSecondsIfStarted: number;
}

/** The daily limit resets at 00:00 UTC — the app has no per-user time zone. */
export function utcDayWindow(now: Date): { start: Date; resetsAt: Date } {
  const start = startOfDay(now, { in: utc });
  return { start, resetsAt: addDays(start, 1, { in: utc }) };
}

/** Ended calls count what they used; active ones count their whole
 * reservation until they end (unused time is given back then). */
export function usedSeconds(rows: UsageRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.status === 'active'
        ? row.reservedSeconds
        : (row.durationSeconds ?? row.reservedSeconds)),
    0,
  );
}

/** `rows` must already be limited to calls started since `utcDayWindow(now).start`. */
export function computeAllowance(rows: UsageRow[], now: Date): Allowance {
  const remainingSeconds = Math.max(0, DAILY_LIMIT_SECONDS - usedSeconds(rows));
  return {
    remainingSeconds,
    resetsAt: utcDayWindow(now).resetsAt,
    canStart: remainingSeconds >= MIN_START_SECONDS,
    reservedSecondsIfStarted: Math.min(PER_CALL_LIMIT_SECONDS, remainingSeconds),
  };
}

export function clampDuration(
  startedAt: Date,
  endedAt: Date,
  reservedSeconds: number,
): number {
  return Math.min(
    reservedSeconds,
    Math.max(0, differenceInSeconds(endedAt, startedAt)),
  );
}

export function isStale(
  row: { startedAt: Date; reservedSeconds: number },
  now: Date,
): boolean {
  return (
    differenceInSeconds(now, row.startedAt) >
    row.reservedSeconds + STALE_GRACE_SECONDS
  );
}
```

- [ ] **Step 6: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/video-call-allowance.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Write the failing copy tests**

`src/lib/__tests__/video-call-copy.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  callEndedLabel,
  callErrorMessage,
  formatCallDuration,
  formatCountdown,
  secondsUntil,
  videoButtonLabel,
} from '#/lib/video-call-copy';

describe('formatCountdown', () => {
  it('renders mm:ss, rounding up and never negative', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(61.2)).toBe('01:02');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('formatCallDuration', () => {
  it('uses seconds under a minute, rounded minutes above', () => {
    expect(formatCallDuration(0)).toBe('1 sec');
    expect(formatCallDuration(45)).toBe('45 sec');
    expect(formatCallDuration(90)).toBe('2 min');
    expect(formatCallDuration(600)).toBe('10 min');
  });
});

describe('callEndedLabel', () => {
  it('names the time limit, else the duration', () => {
    expect(callEndedLabel(600, 'time_limit')).toBe(
      'Video call ended · time limit reached',
    );
    expect(callEndedLabel(480, 'user')).toBe('Video call ended · 8 min');
    expect(callEndedLabel(null, null)).toBe('Video call ended');
  });
});

describe('secondsUntil', () => {
  it('counts down to an ISO instant', () => {
    expect(
      secondsUntil('2026-10-06T12:10:00.000Z', Date.parse('2026-10-06T12:09:00Z')),
    ).toBe(60);
  });
});

describe('videoButtonLabel', () => {
  it('states the reason and what unlocks it when unavailable', () => {
    expect(
      videoButtonLabel({
        status: 'unavailable',
        reason: 'daily_limit',
        resetsAt: '2026-10-07T00:00:00.000Z',
      }),
    ).toBe(
      "Video call unavailable. You've used today's 30 minutes. Resets at 00:00 UTC.",
    );
    expect(
      videoButtonLabel({ status: 'unavailable', reason: 'already_active' }),
    ).toBe("Video call unavailable. You're already on a call in another tab.");
    expect(
      videoButtonLabel({ status: 'unavailable', reason: 'not_configured' }),
    ).toBe("Video call unavailable. Video calls aren't set up on this server yet.");
  });

  it('labels the other states', () => {
    expect(videoButtonLabel({ status: 'available' })).toBe(
      'Start a video call with Viper7',
    );
    expect(videoButtonLabel({ status: 'loading' })).toBe(
      'Checking video call availability…',
    );
    expect(videoButtonLabel({ status: 'in-call' })).toBe(
      'Video call in progress',
    );
  });
});

describe('callErrorMessage', () => {
  it('tells the learner how to allow the microphone', () => {
    expect(callErrorMessage('mic_denied', null)).toBe(
      "Viper needs your microphone for a video call. Allow microphone access in your browser's site settings, then try again.",
    );
  });

  it('reuses the unavailable wording for limit errors', () => {
    expect(callErrorMessage('daily_limit', '2026-10-07T00:00:00.000Z')).toBe(
      "You've used today's 30 minutes. Resets at 00:00 UTC.",
    );
  });
});
```

- [ ] **Step 8: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/video-call-copy.test.ts`
Expected: FAIL — cannot resolve `#/lib/video-call-copy`.

- [ ] **Step 9: Implement the copy module**

`src/lib/video-call-copy.ts`:
```ts
import { utc } from '@date-fns/utc';
import { format } from 'date-fns';
import {
  DAILY_LIMIT_SECONDS,
  type VideoCallEndReason,
  type VideoCallStartErrorReason,
  type VideoCallUnavailableReason,
} from '#/lib/video-call-contract';

export type VideoCallErrorReason =
  | VideoCallStartErrorReason
  | 'mic_denied'
  | 'connection_failed';

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export function callEndedLabel(
  durationSeconds: number | null,
  endReason: VideoCallEndReason | null,
): string {
  if (endReason === 'time_limit') return 'Video call ended · time limit reached';
  if (durationSeconds !== null) {
    return `Video call ended · ${formatCallDuration(durationSeconds)}`;
  }
  return 'Video call ended';
}

export function secondsUntil(iso: string, nowMs: number): number {
  return (Date.parse(iso) - nowMs) / 1000;
}

function resetsAtLabel(resetsAt: string | null | undefined): string {
  if (!resetsAt) return '00:00 UTC';
  return `${format(new Date(resetsAt), 'HH:mm', { in: utc })} UTC`;
}

/** Why a call can't start and what unlocks it — without the leading
 * "Video call unavailable." so it can also be shown as an error body. */
function unavailableDetail(
  reason: VideoCallUnavailableReason,
  resetsAt: string | null | undefined,
): string {
  switch (reason) {
    case 'daily_limit':
      return `You've used today's ${DAILY_LIMIT_SECONDS / 60} minutes. Resets at ${resetsAtLabel(resetsAt)}.`;
    case 'already_active':
      return "You're already on a call in another tab.";
    case 'not_configured':
      return "Video calls aren't set up on this server yet.";
  }
}

export type VideoButtonLabelInput =
  | { status: 'loading' | 'available' | 'in-call' }
  | {
      status: 'unavailable';
      reason: VideoCallUnavailableReason;
      resetsAt?: string;
    };

/** The video button's tooltip AND accessible name — a locked state must say
 * why and what unlocks it in both. */
export function videoButtonLabel(input: VideoButtonLabelInput): string {
  switch (input.status) {
    case 'loading':
      return 'Checking video call availability…';
    case 'available':
      return 'Start a video call with Viper7';
    case 'in-call':
      return 'Video call in progress';
    case 'unavailable':
      return `Video call unavailable. ${unavailableDetail(input.reason, input.resetsAt)}`;
  }
}

export function callErrorMessage(
  reason: VideoCallErrorReason,
  resetsAt: string | null,
): string {
  switch (reason) {
    case 'mic_denied':
      return "Viper needs your microphone for a video call. Allow microphone access in your browser's site settings, then try again.";
    case 'provider_unavailable':
      return "Couldn't start the video call. Try again in a moment.";
    case 'connection_failed':
      return 'The video call lost its connection.';
    case 'daily_limit':
    case 'already_active':
    case 'not_configured':
      return unavailableDetail(reason, resetsAt);
  }
}
```

- [ ] **Step 10: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/video-call-copy.test.ts src/lib/__tests__/video-call-allowance.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/video-call-contract.ts src/lib/video-call-allowance.ts src/lib/video-call-copy.ts src/lib/__tests__/video-call-allowance.test.ts src/lib/__tests__/video-call-copy.test.ts
git commit -m "feat(video-call): contract, UTC daily allowance math and copy"
```

---

### Task 2: Env vars and the Tavus REST client

**Files:**
- Modify: `src/env.ts` (server block)
- Create: `src/lib/tavus.server.ts`, `src/lib/secret-matches.server.ts`
- Test: `src/lib/__tests__/tavus-server.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `env.TAVUS_API_KEY`, `env.TAVUS_REPLICA_ID`, `env.TAVUS_PERSONA_ID?`, `env.TAVUS_LLM_SECRET`, `env.TAVUS_PUBLIC_URL`.
- Produces: `class TavusError extends Error { status: number }`; `createConversation(input: { personaId: string; callbackUrl: string; maxCallDurationSeconds: number; customGreeting: string }): Promise<{ conversationId: string; conversationUrl: string }>`; `endConversation(conversationId: string): Promise<void>`; `getConversation(conversationId: string): Promise<TavusConversation>` where `TavusConversation = { status: string; shutdown: { at: Date; reason: string } | null; transcript: TranscriptTurn[] | null }` and `TranscriptTurn = { role: string; content: string }`.
- Produces: `secretMatches(given: string, expected: string): boolean`.

- [ ] **Step 1: Add the env vars**

In `src/env.ts`, inside `server: { … }` after `ELEVENLABS_API_KEY`, add:
```ts
    // Tavus video calls (docs/superpowers/specs/2026-10-06-tavus-video-call-design.md).
    TAVUS_API_KEY: z.string().min(1),
    TAVUS_REPLICA_ID: z
      .string()
      .regex(/^r[0-9a-z]+$/, 'TAVUS_REPLICA_ID must be a replica id (r…), not a persona id (p…)'),
    // Optional so the dev server boots before `pnpm tavus:sync-persona` has
    // created the persona; unset → the video button says calls aren't set up.
    TAVUS_PERSONA_ID: z.string().regex(/^p[0-9a-z]+$/).optional(),
    // Bearer secret Tavus sends to our completions endpoint, and the webhook token.
    TAVUS_LLM_SECRET: z.string().min(32),
    // Public origin Tavus can reach (ngrok in dev).
    TAVUS_PUBLIC_URL: z.url(),
```
Then in `.env.local` of this worktree (copy the main checkout's file first: `cp ../rmtp-studio/.env.local .env.local`) add:
```bash
echo "TAVUS_LLM_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "TAVUS_PUBLIC_URL=https://<your-ngrok-subdomain>.ngrok.app" >> .env.local
```
`TAVUS_PERSONA_ID` stays unset until Task 10.

- [ ] **Step 2: Write the failing client tests**

`src/lib/__tests__/tavus-server.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#/env', () => ({
  env: { TAVUS_API_KEY: 'test-key', TAVUS_REPLICA_ID: 'r93ce3db27f8' },
}));

import {
  createConversation,
  endConversation,
  getConversation,
  TavusError,
} from '#/lib/tavus.server';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('createConversation', () => {
  it('sends persona, replica, limits and greeting to Tavus', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        conversation_id: 'c1',
        conversation_url: 'https://tavus.daily.co/c1',
        status: 'active',
      }),
    );

    const result = await createConversation({
      personaId: 'p1',
      callbackUrl: 'https://pub.example/api/tavus/webhook?token=t',
      maxCallDurationSeconds: 420,
      customGreeting: 'Hi',
    });

    expect(result).toEqual({
      conversationId: 'c1',
      conversationUrl: 'https://tavus.daily.co/c1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tavusapi.com/v2/conversations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      persona_id: 'p1',
      replica_id: 'r93ce3db27f8',
      callback_url: 'https://pub.example/api/tavus/webhook?token=t',
      custom_greeting: 'Hi',
      properties: {
        max_call_duration: 420,
        participant_left_timeout: 30,
        participant_absent_timeout: 120,
      },
    });
  });

  it('throws TavusError with the status on failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'nope' }, 402));
    await expect(
      createConversation({
        personaId: 'p1',
        callbackUrl: 'https://x.example',
        maxCallDurationSeconds: 60,
        customGreeting: 'Hi',
      }),
    ).rejects.toMatchObject({ name: 'TavusError', status: 402 });
  });
});

describe('endConversation', () => {
  it('posts to the end endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await endConversation('c1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tavusapi.com/v2/conversations/c1/end');
    expect(init.method).toBe('POST');
  });
});

describe('getConversation', () => {
  it('extracts shutdown and transcript from verbose events', async () => {
    // Shape recorded from a real call during the 2026-10-06 spike.
    fetchMock.mockResolvedValueOnce(
      json({
        conversation_id: 'c1',
        status: 'ended',
        events: [
          {
            event_type: 'system.replica_joined',
            timestamp: '2026-10-06T14:18:59.306376Z',
            properties: {},
          },
          {
            event_type: 'system.shutdown',
            timestamp: '2026-10-06T14:19:59.478485Z',
            properties: { shutdown_reason: 'participant_absent_timeout' },
          },
          {
            event_type: 'application.transcription_ready',
            timestamp: '2026-10-06T14:19:59.880405Z',
            properties: {
              transcript: [
                { role: 'system', content: 'rules' },
                { role: 'user', content: 'Hi.' },
              ],
            },
          },
        ],
      }),
    );

    const conv = await getConversation('c1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tavusapi.com/v2/conversations/c1?verbose=true',
    );
    expect(conv.status).toBe('ended');
    expect(conv.shutdown).toEqual({
      at: new Date('2026-10-06T14:19:59.478485Z'),
      reason: 'participant_absent_timeout',
    });
    expect(conv.transcript).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'Hi.' },
    ]);
  });

  it('reports no shutdown and no transcript while active', async () => {
    fetchMock.mockResolvedValueOnce(json({ conversation_id: 'c1', status: 'active' }));
    const conv = await getConversation('c1');
    expect(conv).toEqual({ status: 'active', shutdown: null, transcript: null });
  });

  it('is a TavusError on 404', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'missing' }, 404));
    await expect(getConversation('nope')).rejects.toBeInstanceOf(TavusError);
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/tavus-server.test.ts`
Expected: FAIL — cannot resolve `#/lib/tavus.server`.

- [ ] **Step 4: Implement the client and secret compare**

`src/lib/tavus.server.ts`:
```ts
import { z } from 'zod';
import { env } from '#/env';

/**
 * Minimal Tavus REST client. Server-only: it carries TAVUS_API_KEY.
 * Request/response shapes were verified against the live API during the
 * 2026-10-06 spike (see the spec's "Spike findings").
 */

const TAVUS_API = 'https://tavusapi.com/v2';

export class TavusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TavusError';
  }
}

async function tavusFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${TAVUS_API}${path}`, {
    ...init,
    headers: {
      'x-api-key': env.TAVUS_API_KEY,
      'content-type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TavusError(
      res.status,
      `Tavus ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return text ? (JSON.parse(text) as unknown) : null;
}

const createdSchema = z.object({
  conversation_id: z.string(),
  conversation_url: z.url(),
});

export async function createConversation(input: {
  personaId: string;
  callbackUrl: string;
  maxCallDurationSeconds: number;
  customGreeting: string;
}): Promise<{ conversationId: string; conversationUrl: string }> {
  const body = await tavusFetch('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      persona_id: input.personaId,
      replica_id: env.TAVUS_REPLICA_ID,
      callback_url: input.callbackUrl,
      custom_greeting: input.customGreeting,
      properties: {
        max_call_duration: input.maxCallDurationSeconds,
        // End ~30 s after the learner leaves (closed tab), and give up if
        // they never join within 2 minutes.
        participant_left_timeout: 30,
        participant_absent_timeout: 120,
      },
    }),
  });
  const parsed = createdSchema.parse(body);
  return {
    conversationId: parsed.conversation_id,
    conversationUrl: parsed.conversation_url,
  };
}

/** Ending an already-ended conversation returns 200 (verified in the spike). */
export async function endConversation(conversationId: string): Promise<void> {
  await tavusFetch(`/conversations/${encodeURIComponent(conversationId)}/end`, {
    method: 'POST',
  });
}

const transcriptTurnSchema = z.object({ role: z.string(), content: z.string() });
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

const conversationSchema = z.object({
  status: z.string(),
  events: z
    .array(
      z.object({
        event_type: z.string(),
        timestamp: z.string(),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export interface TavusConversation {
  status: string;
  shutdown: { at: Date; reason: string } | null;
  transcript: TranscriptTurn[] | null;
}

export async function getConversation(
  conversationId: string,
): Promise<TavusConversation> {
  const body = conversationSchema.parse(
    await tavusFetch(`/conversations/${encodeURIComponent(conversationId)}?verbose=true`),
  );
  const events = body.events ?? [];
  const shutdownEvent = events.find((e) => e.event_type === 'system.shutdown');
  const transcriptEvent = events.find(
    (e) => e.event_type === 'application.transcription_ready',
  );
  const transcript = z
    .array(transcriptTurnSchema)
    .safeParse(transcriptEvent?.properties?.transcript);

  return {
    status: body.status,
    shutdown: shutdownEvent
      ? {
          at: new Date(shutdownEvent.timestamp),
          reason: String(shutdownEvent.properties?.shutdown_reason ?? ''),
        }
      : null,
    transcript: transcript.success ? transcript.data : null,
  };
}
```

`src/lib/secret-matches.server.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';

/** Constant-time string compare for shared secrets. */
export function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 5: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/tavus-server.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/lib/tavus.server.ts src/lib/secret-matches.server.ts src/lib/__tests__/tavus-server.test.ts
git commit -m "feat(video-call): Tavus env vars and REST client"
```

---

### Task 3: `video_calls` table and queries

**Files:**
- Modify: `src/db/schema.ts` (append), `src/db/chat.ts` (`appendMessages` executor), `package.json` (script)
- Create: `src/db/migrate-video-calls.ts`, `src/db/video-calls.ts`

**Interfaces:**
- Consumes: `VideoCallEndReason` (Task 1).
- Produces: `videoCalls` table; `type VideoCall = typeof videoCalls.$inferSelect` with fields `id, userId, userName, chatId, courseSlug, tavusConversationId, status: 'active' | 'ended', reservedSeconds, startedAt, endedAt, durationSeconds, endReason: VideoCallEndReason | null, transcriptSavedAt`.
- Produces: `listCallsSince(userId: string, since: Date): Promise<VideoCall[]>`, `getActiveCallForUser(userId: string): Promise<VideoCall | null>`, `getCallForUser(id: string, userId: string): Promise<VideoCall | null>`, `getCallById(id: string): Promise<VideoCall | null>`, `getCallByConversation(conversationId: string): Promise<VideoCall | null>`, `insertActiveCall(values: NewActiveCall): Promise<VideoCall | 'already_active'>`, `markCallEnded(id: string, fields: { endedAt: Date; durationSeconds: number; endReason: VideoCallEndReason }): Promise<boolean>`, `saveTranscriptOnce(id: string, chatId: string, messages: Array<{ role: string; parts: unknown }>): Promise<boolean>`.
- Produces: `appendMessages(chatId, msgs, executor = db)`.

No unit tests: this repo has no test database; these are thin queries exercised by route tests (mocked) and the manual walkthrough in Task 15.

- [ ] **Step 1: Add the table to the schema**

Append to `src/db/schema.ts`:
```ts
/**
 * One row per Tavus video call (docs/superpowers/specs/2026-10-06-tavus-video-call-design.md).
 * Created by migrate-video-calls.ts, not drizzle-kit push — keep the two in step.
 * The `status in ('active','ended')` check constraint lives only in the DDL.
 */
export const videoCalls = pgTable(
  'video_calls',
  {
    id: varchar('id', { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    /** Session name at start — the completions endpoint has no session. */
    userName: varchar('user_name', { length: 255 }),
    chatId: varchar('chat_id', { length: 255 })
      .notNull()
      .references(() => aiChats.id, { onDelete: 'cascade' }),
    courseSlug: varchar('course_slug', { length: 255 }),
    tavusConversationId: varchar('tavus_conversation_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 16 })
      .$type<'active' | 'ended'>()
      .notNull()
      .default('active'),
    reservedSeconds: integer('reserved_seconds').notNull(),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    endedAt: timestamp('ended_at', { mode: 'date', withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    endReason: varchar('end_reason', { length: 16 }).$type<
      'user' | 'time_limit' | 'left' | 'error' | 'stale'
    >(),
    transcriptSavedAt: timestamp('transcript_saved_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (t) => [
    uniqueIndex('video_calls_tavus_conversation_idx').on(t.tavusConversationId),
    uniqueIndex('video_calls_one_active_per_user_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index('video_calls_user_started_idx').on(t.userId, t.startedAt),
  ],
);
```
(The `endReason` union is spelled out rather than imported so `schema.ts` keeps no dependency on `src/lib`; it must match `videoCallEndReasonSchema` in Task 1.)

- [ ] **Step 2: Write the migration script**

`src/db/migrate-video-calls.ts`:
```ts
/**
 * Idempotent migration for `video_calls`.
 *
 * Hand-written rather than generated, for the reason migrate-offerings.ts
 * gives: `drizzle-kit push` diffs the whole schema and offers to truncate
 * `docs` over unrelated drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-video-calls
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating video_calls…');
  await db.execute(sql`
    create table if not exists "video_calls" (
      "id"                    varchar(255) primary key,
      "user_id"               varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "user_name"             varchar(255),
      "chat_id"               varchar(255) not null references "ai_chats"("id") on delete cascade,
      "course_slug"           varchar(255),
      "tavus_conversation_id" varchar(255) not null,
      "status"                varchar(16) not null default 'active',
      "reserved_seconds"      integer not null,
      "started_at"            timestamp with time zone not null default CURRENT_TIMESTAMP,
      "ended_at"              timestamp with time zone,
      "duration_seconds"      integer,
      "end_reason"            varchar(16),
      "transcript_saved_at"   timestamp with time zone,
      constraint "video_calls_status_check" check ("status" in ('active', 'ended'))
    );
  `);
  await db.execute(sql`
    create unique index if not exists "video_calls_tavus_conversation_idx"
      on "video_calls" ("tavus_conversation_id");
  `);
  // At most one active call per user — the race guard behind the 409.
  await db.execute(sql`
    create unique index if not exists "video_calls_one_active_per_user_idx"
      on "video_calls" ("user_id") where "status" = 'active';
  `);
  await db.execute(sql`
    create index if not exists "video_calls_user_started_idx"
      on "video_calls" ("user_id", "started_at");
  `);
  console.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```
Check the tail of `src/db/migrate-offerings.ts` and match its exit handling if it differs.

Add to `package.json` `scripts` (next to the other `db:migrate-*` entries):
```json
"db:migrate-video-calls": "dotenv -e .env.local -- tsx src/db/migrate-video-calls.ts",
```

- [ ] **Step 3: Let `appendMessages` run inside a transaction**

In `src/db/chat.ts`, change the signature and use the executor for all three statements:
```ts
/** `db` itself or a transaction handle — lets callers append inside their own
 * transaction (saveTranscriptOnce claims and inserts atomically). */
type ChatExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

export async function appendMessages(
  chatId: string,
  msgs: Array<{ role: string; parts: unknown }>,
  executor: ChatExecutor = db,
): Promise<void> {
```
…and replace `db.select`, `db.insert`, `db.update` in its body with `executor.select`, `executor.insert`, `executor.update`. If `tsc` rejects passing a transaction as `ChatExecutor`, type it as `PgDatabase<NodePgQueryResultHKT, typeof schema>` (from `drizzle-orm/pg-core` and `drizzle-orm/node-postgres`) instead.

Run: `pnpm vitest run src/routes/api/__tests__/chat.test.ts`
Expected: PASS (existing callers use the default).

- [ ] **Step 4: Write the query module**

`src/db/video-calls.ts`:
```ts
import { and, eq, gte, isNull } from 'drizzle-orm';
import { db } from '#/db';
import { appendMessages } from '#/db/chat';
import { videoCalls } from '#/db/schema';
import type { VideoCallEndReason } from '#/lib/video-call-contract';

export type VideoCall = typeof videoCalls.$inferSelect;

export interface NewActiveCall {
  userId: string;
  userName: string | null;
  chatId: string;
  courseSlug: string | null;
  tavusConversationId: string;
  reservedSeconds: number;
}

const ONE_ACTIVE_INDEX = 'video_calls_one_active_per_user_idx';

export async function listCallsSince(userId: string, since: Date): Promise<VideoCall[]> {
  return db
    .select()
    .from(videoCalls)
    .where(and(eq(videoCalls.userId, userId), gte(videoCalls.startedAt, since)));
}

export async function getActiveCallForUser(userId: string): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(and(eq(videoCalls.userId, userId), eq(videoCalls.status, 'active')))
    .limit(1);
  return row ?? null;
}

/** Ownership-scoped: another user's id reads as missing. */
export async function getCallForUser(id: string, userId: string): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(and(eq(videoCalls.id, id), eq(videoCalls.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getCallById(id: string): Promise<VideoCall | null> {
  const [row] = await db.select().from(videoCalls).where(eq(videoCalls.id, id)).limit(1);
  return row ?? null;
}

export async function getCallByConversation(conversationId: string): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(eq(videoCalls.tavusConversationId, conversationId))
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  // node-postgres puts code/constraint on the error; drizzle may wrap it in `cause`.
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  const pg = (e.cause ?? e) as { code?: string; constraint?: string };
  return pg.code === '23505' && pg.constraint === constraint;
}

export async function insertActiveCall(
  values: NewActiveCall,
): Promise<VideoCall | 'already_active'> {
  try {
    const [row] = await db
      .insert(videoCalls)
      .values({ ...values, status: 'active' })
      .returning();
    if (!row) throw new Error('insertActiveCall: insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err, ONE_ACTIVE_INDEX)) return 'already_active';
    throw err;
  }
}

/** Only transitions an active row; returns whether it did. */
export async function markCallEnded(
  id: string,
  fields: { endedAt: Date; durationSeconds: number; endReason: VideoCallEndReason },
): Promise<boolean> {
  const rows = await db
    .update(videoCalls)
    .set({ status: 'ended', ...fields })
    .where(and(eq(videoCalls.id, id), eq(videoCalls.status, 'active')))
    .returning({ id: videoCalls.id });
  return rows.length > 0;
}

/**
 * Claims `transcript_saved_at` and appends the messages in one transaction,
 * so the webhook, the end route and client polling can all call it and the
 * transcript lands exactly once. Returns false when already saved.
 */
export async function saveTranscriptOnce(
  id: string,
  chatId: string,
  messages: Array<{ role: string; parts: unknown }>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(videoCalls)
      .set({ transcriptSavedAt: new Date() })
      .where(and(eq(videoCalls.id, id), isNull(videoCalls.transcriptSavedAt)))
      .returning({ id: videoCalls.id });
    if (claimed.length === 0) return false;
    await appendMessages(chatId, messages, tx);
    return true;
  });
}
```

- [ ] **Step 5: Type-check and run the migration**

Run: `pnpm tsc --noEmit -p .`
Expected: no new errors.

Run: `pnpm db:migrate-video-calls`
Expected: `Creating video_calls…` then `Done.` Re-run it once: same output, no error (idempotent).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/chat.ts src/db/migrate-video-calls.ts src/db/video-calls.ts package.json
git commit -m "feat(video-call): video_calls table, migration and queries"
```

---

### Task 4: Interpreting Tavus payloads

**Files:**
- Create: `src/lib/tavus-messages.ts`
- Test: `src/lib/__tests__/tavus-messages.test.ts`

**Interfaces:**
- Consumes: `callEndedLabel` (Task 1), `TranscriptTurn` (Task 2), `VideoCallEndReason` (Task 1).
- Produces: `PERSONA_SENTINEL = '[[VIPER7_PERSONA_PROMPT]]'`, `TAVUS_CONFIG_CHECK_ID = 'tavus-openai-compat-test'`, `tavusCompletionRequestSchema`, `splitTavusMessages(messages: OpenAIChatMessage[]): { tavusRules: string; history: UIMessage[] }`, `stripSsml(text: string): string`, `transcriptToMessages(transcript: TranscriptTurn[], summary: { durationSeconds: number | null; endReason: VideoCallEndReason | null }): Array<{ role: 'user' | 'assistant'; parts: unknown[] }>`, `mapShutdownReason(reason: string | undefined): VideoCallEndReason`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/tavus-messages.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  mapShutdownReason,
  PERSONA_SENTINEL,
  splitTavusMessages,
  stripSsml,
  transcriptToMessages,
} from '#/lib/tavus-messages';

// Modelled on the messages Tavus actually sent during the spike.
const TAVUS_MESSAGES = [
  {
    role: 'system',
    content: `${PERSONA_SENTINEL}\n\nYou are in a live video conference call. EVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG.`,
  },
  { role: 'system', content: "The user's timezone is unknown." },
  { role: 'assistant', content: 'Hi, it is Viper7.' },
  { role: 'system', content: 'respond in english' },
  {
    role: 'system',
    content:
      '<user_appearance>\nAn adult with glasses.\n</user_appearance>\n\n<user_emotions>\nNeutral.\n</user_emotions>',
  },
  { role: 'user', content: 'What is Vref?' },
];

describe('splitTavusMessages', () => {
  it('keeps Tavus rules, drops perception and the persona sentinel', () => {
    const { tavusRules } = splitTavusMessages(TAVUS_MESSAGES);
    expect(tavusRules).toContain('EVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG');
    expect(tavusRules).toContain("The user's timezone is unknown.");
    expect(tavusRules).toContain('respond in english');
    expect(tavusRules).not.toContain(PERSONA_SENTINEL);
    expect(tavusRules).not.toContain('user_appearance');
    expect(tavusRules).not.toContain('glasses');
  });

  it('turns user/assistant turns into UI messages in order', () => {
    const { history } = splitTavusMessages(TAVUS_MESSAGES);
    expect(history.map((m) => [m.role, m.parts])).toEqual([
      ['assistant', [{ type: 'text', text: 'Hi, it is Viper7.' }]],
      ['user', [{ type: 'text', text: 'What is Vref?' }]],
    ]);
  });

  it('reads array content parts and skips empty turns', () => {
    const { history } = splitTavusMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: null },
    ]);
    expect(history).toHaveLength(1);
    expect(history[0]?.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});

describe('stripSsml', () => {
  it('removes emotion and other SSML tags but keeps ordinary text', () => {
    expect(stripSsml('<emotion value="content"/>Vref is <break time="1s"/>speed.')).toBe(
      'Vref is speed.',
    );
    expect(stripSsml('If a < b then fine')).toBe('If a < b then fine');
  });
});

describe('transcriptToMessages', () => {
  it('brackets cleaned turns with status lines and drops system turns', () => {
    const out = transcriptToMessages(
      [
        { role: 'system', content: 'rules' },
        { role: 'assistant', content: 'Hi, it is Viper7.' },
        { role: 'user', content: ' What is Vref? ' },
        { role: 'assistant', content: '<emotion value="content"/>Reference speed.' },
        { role: 'assistant', content: '<emotion value="neutral"/>' },
      ],
      { durationSeconds: 480, endReason: 'user' },
    );
    expect(out).toEqual([
      {
        role: 'assistant',
        parts: [{ type: 'data-notification', data: { text: 'Video call with Viper7' } }],
      },
      { role: 'assistant', parts: [{ type: 'text', text: 'Hi, it is Viper7.' }] },
      { role: 'user', parts: [{ type: 'text', text: 'What is Vref?' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Reference speed.' }] },
      {
        role: 'assistant',
        parts: [{ type: 'data-notification', data: { text: 'Video call ended · 8 min' } }],
      },
    ]);
  });
});

describe('mapShutdownReason', () => {
  it('maps Tavus shutdown reasons to ours', () => {
    expect(mapShutdownReason('max_call_duration')).toBe('time_limit');
    expect(mapShutdownReason('participant_left_timeout')).toBe('left');
    expect(mapShutdownReason('participant_absent_timeout')).toBe('left');
    expect(mapShutdownReason('end_call_endpoint_hit')).toBe('user');
    expect(mapShutdownReason(undefined)).toBe('user');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/tavus-messages.test.ts`
Expected: FAIL — cannot resolve `#/lib/tavus-messages`.

- [ ] **Step 3: Implement**

`src/lib/tavus-messages.ts`:
```ts
import type { UIMessage } from 'ai';
import { z } from 'zod';
import type { VideoCallEndReason } from '#/lib/video-call-contract';
import { callEndedLabel } from '#/lib/video-call-copy';

/**
 * Interpreting what Tavus sends us. Shapes come from the 2026-10-06 spike —
 * see the spec's "Spike findings".
 */

/** The Tavus persona's `system_prompt` (set by tavus-sync-persona). Tavus
 * puts it first in the first system message; we drop it and use our own. */
export const PERSONA_SENTINEL = '[[VIPER7_PERSONA_PROMPT]]';

/** Tavus validates a custom LLM with this placeholder conversation id. */
export const TAVUS_CONFIG_CHECK_ID = 'tavus-openai-compat-test';

const PERCEPTION_TAG_RE = /<user_(?:appearance|emotions|screen)>/;
// A tag must start with a letter, so "a < b" survives.
const SSML_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;

const contentPartSchema = z.object({ type: z.string(), text: z.string().optional() });
export const openAIChatMessageSchema = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(contentPartSchema), z.null()]).optional(),
});
export type OpenAIChatMessage = z.infer<typeof openAIChatMessageSchema>;

export const tavusCompletionRequestSchema = z.object({
  messages: z.array(openAIChatMessageSchema),
});

function contentText(content: OpenAIChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? '').join('');
  return '';
}

/**
 * Splits a Tavus completions request into Tavus's own rules (speech style,
 * mandatory emotion tags, date/time — kept) and the call's turns. Perception
 * messages (the learner's appearance, guessed ethnicity, emotions) are
 * dropped here so they never reach the model, logs or the database.
 */
export function splitTavusMessages(messages: OpenAIChatMessage[]): {
  tavusRules: string;
  history: UIMessage[];
} {
  const rules: string[] = [];
  const history: UIMessage[] = [];

  messages.forEach((message, index) => {
    const text = contentText(message.content);
    if (message.role === 'system' || message.role === 'developer') {
      if (PERCEPTION_TAG_RE.test(text)) return;
      const kept = text
        .split('\n')
        .filter((line) => line.trim() !== PERSONA_SENTINEL)
        .join('\n')
        .trim();
      if (kept) rules.push(kept);
      return;
    }
    if ((message.role === 'user' || message.role === 'assistant') && text.trim()) {
      history.push({
        id: `tavus-${index}`,
        role: message.role,
        parts: [{ type: 'text', text }],
      });
    }
  });

  return { tavusRules: rules.join('\n\n'), history };
}

export function stripSsml(text: string): string {
  return text.replace(SSML_TAG_RE, ' ').replace(/\s+/g, ' ').trim();
}

function statusLine(text: string) {
  return {
    role: 'assistant' as const,
    parts: [{ type: 'data-notification', data: { text } }] as unknown[],
  };
}

/**
 * Tavus's final transcript → messages to append to the chat. Bracketed by
 * two `data-notification` status lines, which the chat widget already renders
 * as muted text (ai_messages has no metadata column to mark them otherwise).
 */
export function transcriptToMessages(
  transcript: Array<{ role: string; content: string }>,
  summary: { durationSeconds: number | null; endReason: VideoCallEndReason | null },
): Array<{ role: 'user' | 'assistant'; parts: unknown[] }> {
  const turns = transcript.flatMap((turn) => {
    const role =
      turn.role === 'user' ? 'user' : turn.role === 'assistant' ? 'assistant' : null;
    if (!role) return [];
    const text = role === 'assistant' ? stripSsml(turn.content) : turn.content.trim();
    return text ? [{ role, parts: [{ type: 'text', text }] as unknown[] }] : [];
  });

  return [
    statusLine('Video call with Viper7'),
    ...turns,
    statusLine(callEndedLabel(summary.durationSeconds, summary.endReason)),
  ];
}

export function mapShutdownReason(reason: string | undefined): VideoCallEndReason {
  if (!reason) return 'user';
  if (reason.includes('max_call_duration')) return 'time_limit';
  if (/participant_(?:left|absent)/.test(reason)) return 'left';
  return 'user';
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/tavus-messages.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tavus-messages.ts src/lib/__tests__/tavus-messages.test.ts
git commit -m "feat(video-call): interpret Tavus messages and transcripts"
```

---

### Task 5: OpenAI-compatible SSE adapter

**Files:**
- Create: `src/lib/openai-sse.ts`
- Test: `src/lib/__tests__/openai-sse.test.ts`

**Interfaces:**
- Produces: `toOpenAIChatCompletionStream(produce: () => Promise<AsyncIterable<string>>, options: { model: string; fallbackText: string; signal?: AbortSignal; keepaliveMs?: number; onError?: (err: unknown) => void }): ReadableStream<Uint8Array>`; `openAISseResponse(stream: ReadableStream<Uint8Array>): Response`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/openai-sse.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { toOpenAIChatCompletionStream } from '#/lib/openai-sse';

async function* yieldAll(parts: string[]) {
  for (const p of parts) yield p;
}

async function read(stream: ReadableStream<Uint8Array>) {
  const raw = await new Response(stream).text();
  const events = raw.split('\n\n').filter(Boolean);
  const data = events.filter((e) => e.startsWith('data: ')).map((e) => e.slice(6));
  const chunks = data.filter((d) => d !== '[DONE]').map((d) => JSON.parse(d));
  return {
    raw,
    done: data.at(-1) === '[DONE]',
    text: chunks.map((c) => c.choices[0].delta.content ?? '').join(''),
    chunks,
  };
}

describe('toOpenAIChatCompletionStream', () => {
  it('emits chat.completion.chunk deltas, a stop chunk and [DONE]', async () => {
    const out = await read(
      toOpenAIChatCompletionStream(async () => yieldAll(['Hello', ' there']), {
        model: 'viper7',
        fallbackText: 'fallback',
      }),
    );
    expect(out.text).toBe('Hello there');
    expect(out.done).toBe(true);
    expect(out.chunks[0]).toMatchObject({
      object: 'chat.completion.chunk',
      model: 'viper7',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }],
    });
    expect(out.chunks.at(-1)?.choices[0]).toMatchObject({ delta: {}, finish_reason: 'stop' });
  });

  it('speaks the fallback and reports the error when generation fails', async () => {
    const onError = vi.fn();
    const out = await read(
      toOpenAIChatCompletionStream(
        async () => {
          throw new Error('model down');
        },
        { model: 'viper7', fallbackText: 'Sorry, say again?', onError },
      ),
    );
    expect(out.text).toBe('Sorry, say again?');
    expect(out.done).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'model down' }));
  });

  it('speaks the fallback when the model produced no text', async () => {
    const out = await read(
      toOpenAIChatCompletionStream(async () => yieldAll(['', '']), {
        model: 'viper7',
        fallbackText: 'Sorry, say again?',
      }),
    );
    expect(out.text).toBe('Sorry, say again?');
  });

  it('aborted signal: no onError, no fallback', async () => {
    const controller = new AbortController();
    const onError = vi.fn();
    const stream = toOpenAIChatCompletionStream(
      async () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
      { model: 'viper7', fallbackText: 'Sorry, say again?', signal: controller.signal, onError },
    );
    const out = await read(stream);
    expect(onError).not.toHaveBeenCalled();
    expect(out.text).toBe('');
  });

  it('writes keepalive comments until the first token', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const stream = toOpenAIChatCompletionStream(
      async () => {
        await gate;
        return yieldAll(['Hi']);
      },
      { model: 'viper7', fallbackText: 'x', keepaliveMs: 1000 },
    );
    const reading = read(stream);
    await vi.advanceTimersByTimeAsync(2500);
    release();
    vi.useRealTimers();
    const out = await reading;
    expect(out.raw.match(/: keepalive/g)?.length).toBe(2);
    expect(out.text).toBe('Hi');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/openai-sse.test.ts`
Expected: FAIL — cannot resolve `#/lib/openai-sse`.

- [ ] **Step 3: Implement**

`src/lib/openai-sse.ts`:
```ts
/**
 * Adapts a text stream into OpenAI `chat.completion.chunk` server-sent
 * events — the format Tavus's custom-LLM client (OpenAI Python SDK, 10 s read
 * timeout) consumes.
 *
 * - `produce` runs inside the stream, so a failure before the first token
 *   still yields a spoken fallback instead of an HTTP error (Tavus would go
 *   silent).
 * - Until the first token, an SSE comment is written every `keepaliveMs` so a
 *   slow tool step can't trip the read timeout. Comments are ignored by SSE
 *   parsers.
 * - When `signal` aborts (Tavus cancelled a speculative request), nothing
 *   more is written and the error is not reported.
 */
export function toOpenAIChatCompletionStream(
  produce: () => Promise<AsyncIterable<string>>,
  options: {
    model: string;
    fallbackText: string;
    signal?: AbortSignal;
    keepaliveMs?: number;
    onError?: (err: unknown) => void;
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const id = `chatcmpl-${crypto.randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      const chunk = (
        delta: { role?: 'assistant'; content?: string },
        finishReason: 'stop' | null,
      ) =>
        send(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: options.model,
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}\n\n`,
        );

      let sentText = false;
      const emit = (content: string) => {
        chunk(sentText ? { content } : { role: 'assistant', content }, null);
        sentText = true;
      };
      const keepalive = setInterval(() => {
        if (!sentText) send(': keepalive\n\n');
      }, options.keepaliveMs ?? 2000);
      const aborted = () => options.signal?.aborted === true;

      try {
        const stream = await produce();
        for await (const text of stream) {
          if (aborted()) break;
          if (text) emit(text);
        }
      } catch (err) {
        if (!aborted()) options.onError?.(err);
      } finally {
        clearInterval(keepalive);
      }

      if (!aborted()) {
        if (!sentText) emit(options.fallbackText);
        chunk({}, 'stop');
        send('data: [DONE]\n\n');
      }
      closed = true;
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });
}

export function openAISseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/openai-sse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/openai-sse.ts src/lib/__tests__/openai-sse.test.ts
git commit -m "feat(video-call): OpenAI-compatible SSE adapter with keepalive and fallback"
```

---

### Task 6: Voice mode for `buildChatStream`

**Files:**
- Create: `src/ai/prompts/voice-mode.ts`
- Modify: `src/ai/chat.ts`
- Test: `src/ai/__tests__/chat-voice.test.ts`

**Interfaces:**
- Produces: `VOICE_MODE_PROMPT: string`, `VOICE_FALLBACK_REPLY: string`, `VOICE_NO_TURN_REPLY: string`, `VIDEO_CALL_GREETING: string`.
- Produces: `BuildChatStreamOptions.voice?: { tavusRules: string }`, `BuildChatStreamOptions.abortSignal?: AbortSignal`. Result type unchanged (`streamText` result; the completions route reads `.textStream`).

- [ ] **Step 1: Write the voice prompt module**

`src/ai/prompts/voice-mode.ts`:
```ts
import { brand } from '#/ai/prompts/brand';

/** Appended to viper7's system prompt on a Tavus video call. Tavus's own
 * rules (emotion tags, TTS punctuation) are appended after this. */
export const VOICE_MODE_PROMPT = `
## Voice call
You are speaking with the learner on a live video call; every word you write is spoken aloud.
- Keep answers to two or three short sentences unless the learner asks for more detail.
- Never use markdown, lists, headings, links, code or emoji.
- When you use course material from searchKB, say it naturally. Do not read out citations, file names or URLs.
- If searchKB finds nothing relevant, say so in one sentence and offer what you can.
- Do not greet the learner again; the call has already started.
`.trim();

/** Spoken when generation fails or returns nothing. */
export const VOICE_FALLBACK_REPLY =
  '<emotion value="neutral"/>Sorry, I lost that. Could you say it again?';

/** Spoken when Tavus asks for a reply before the learner has said anything. */
export const VOICE_NO_TURN_REPLY =
  '<emotion value="content"/>I am here. What would you like to go over?';

/** Tavus `custom_greeting` — spoken on join without an LLM call. */
export const VIDEO_CALL_GREETING = `Hi, it's ${brand.ai.name}. What would you like to go over?`;
```

- [ ] **Step 2: Write the failing tests**

`src/ai/__tests__/chat-voice.test.ts`:
```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamText, smoothStream } = vi.hoisted(() => ({
  streamText: vi.fn((_opts: Record<string, unknown>) => ({ textStream: 'stream' })),
  smoothStream: vi.fn((opts: unknown) => ({ smooth: opts })),
}));
vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async (m: unknown) => m),
  smoothStream,
  stepCountIs: vi.fn((n: number) => ({ steps: n })),
  streamText,
}));
vi.mock('#/ai/ai-provider', () => ({ geminiFlash: 'model' }));
vi.mock('#/ai/prompts/viper7', () => ({ viper7SystemPrompt: () => 'BASE PROMPT' }));
vi.mock('#/ai/tools/search-kb', () => ({ makeSearchKBTool: () => 'searchKB' }));
vi.mock('#/ai/tools/check-flyability', () => ({ makeCheckFlyabilityTool: () => 'checkFlyability' }));

import { buildChatStream } from '#/ai/chat';
import { VOICE_MODE_PROMPT } from '#/ai/prompts/voice-mode';

const base = { messages: [], uiMessages: [], subscriptions: [], userId: 'u1' };

beforeEach(() => vi.clearAllMocks());

describe('buildChatStream', () => {
  it('text chat is unchanged: base prompt only, line chunking', async () => {
    await buildChatStream(base);
    const args = streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.system).toBe('BASE PROMPT');
    expect(smoothStream).toHaveBeenCalledWith({ delayInMs: 20, chunking: 'line' });
  });

  it('voice: appends the voice prompt and Tavus rules, word chunking, abort signal', async () => {
    const abortSignal = new AbortController().signal;
    await buildChatStream({ ...base, voice: { tavusRules: 'TAVUS RULES' }, abortSignal });
    const args = streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.system).toBe(`BASE PROMPT\n\n${VOICE_MODE_PROMPT}\n\nTAVUS RULES`);
    expect(args.abortSignal).toBe(abortSignal);
    expect(smoothStream).toHaveBeenCalledWith({ delayInMs: 20, chunking: 'word' });
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `pnpm vitest run src/ai/__tests__/chat-voice.test.ts`
Expected: FAIL — the voice test (system is still `'BASE PROMPT'`, chunking `'line'`).

- [ ] **Step 4: Implement**

In `src/ai/chat.ts`:
1. Add `import { VOICE_MODE_PROMPT } from '#/ai/prompts/voice-mode';`.
2. Add to `BuildChatStreamOptions`:
```ts
  /**
   * Tavus video call. Appends the voice prompt and Tavus's own rules
   * (emotion tags, speech punctuation) to the system prompt, and switches
   * `smoothStream` to word chunking — line chunking would hold a spoken
   * reply, which has no newlines, back until it finished.
   */
  voice?: { tavusRules: string };
  /** Cancels generation when Tavus abandons a (speculative) request. */
  abortSignal?: AbortSignal;
```
3. Destructure `voice` and `abortSignal`, and change the `streamText` call:
```ts
  const basePrompt = viper7SystemPrompt({
    isAssociate: isAssociateFrom(subscriptions),
    persona,
    userInfo,
    skaProfile,
  });

  return streamText({
    model: geminiFlash,
    system: voice
      ? [basePrompt, VOICE_MODE_PROMPT, voice.tavusRules].filter(Boolean).join('\n\n')
      : basePrompt,
    messages: modelMessages,
    abortSignal,
    tools: { /* unchanged */ },
    toolChoice: 'auto',
    stopWhen: stepCountIs(4),
    experimental_transform: [
      smoothStream({ delayInMs: 20, chunking: voice ? 'word' : 'line' }),
    ],
  });
```

- [ ] **Step 5: Run to confirm it passes**

Run: `pnpm vitest run src/ai/__tests__/chat-voice.test.ts src/routes/api/__tests__/chat.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/prompts/voice-mode.ts src/ai/chat.ts src/ai/__tests__/chat-voice.test.ts
git commit -m "feat(video-call): voice mode for buildChatStream"
```

---

### Task 7: The completions endpoint Tavus calls

**Files:**
- Create: `src/routes/api/tavus/v1/chat/completions.ts`
- Test: `src/routes/api/__tests__/tavus-completions.test.ts`

**Interfaces:**
- Consumes: `secretMatches` (T2), `getCallByConversation`, `VideoCall` (T3), `getChat` (`#/db/chat`), `splitTavusMessages`, `tavusCompletionRequestSchema`, `TAVUS_CONFIG_CHECK_ID` (T4), `toOpenAIChatCompletionStream`, `openAISseResponse` (T5), `buildChatStream` + `voice`/`abortSignal` (T6), `VOICE_FALLBACK_REPLY`, `VOICE_NO_TURN_REPLY` (T6), `resolvePersonaForChat`, `getActiveOrgId`, `resolveChatSkaProfile`.
- Produces: `tavusCompletionsHandler(request: Request): Promise<Response>`; route `POST /api/tavus/v1/chat/completions`.

- [ ] **Step 1: Write the failing tests**

`src/routes/api/__tests__/tavus-completions.test.ts`:
```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);
const {
  getCallByConversation,
  getChat,
  buildChatStream,
  resolvePersonaForChat,
  resolveChatSkaProfile,
} = vi.hoisted(() => ({
  getCallByConversation: vi.fn(),
  getChat: vi.fn(),
  buildChatStream: vi.fn(),
  resolvePersonaForChat: vi.fn(),
  resolveChatSkaProfile: vi.fn(),
}));
vi.mock('#/env', () => ({ env: { TAVUS_LLM_SECRET: 's'.repeat(32) } }));
vi.mock('#/db/video-calls', () => ({ getCallByConversation }));
vi.mock('#/db/chat', () => ({ getChat }));
vi.mock('#/ai/chat', () => ({ buildChatStream }));
vi.mock('#/db/course-orgs', () => ({ resolvePersonaForChat }));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 7 }));
vi.mock('#/lib/ska-profile.server', () => ({ resolveChatSkaProfile }));

import { VOICE_FALLBACK_REPLY, VOICE_NO_TURN_REPLY } from '#/ai/prompts/voice-mode';
import { PERSONA_SENTINEL } from '#/lib/tavus-messages';
import { tavusCompletionsHandler } from '../tavus/v1/chat/completions';

const ACTIVE_CALL = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: 'ppl',
  tavusConversationId: 'conv-1',
  status: 'active',
  reservedSeconds: 600,
  startedAt: new Date('2026-10-06T12:00:00Z'),
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};

const BODY = {
  model: 'viper7',
  stream: true,
  messages: [
    { role: 'system', content: `${PERSONA_SENTINEL}\n\nEVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG.` },
    { role: 'assistant', content: "Hi, it's Viper7." },
    { role: 'system', content: '<user_appearance>\nGlasses.\n</user_appearance>' },
    { role: 'user', content: 'What is Vref?' },
  ],
};

function req(opts: { auth?: string; conv?: string; body?: unknown } = {}) {
  return new Request('http://t/api/tavus/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: opts.auth ?? `Bearer ${SECRET}`,
      'conversation-id': opts.conv ?? 'conv-1',
      'content-type': 'application/json',
    },
    body: JSON.stringify(opts.body ?? BODY),
  });
}

async function spokenText(res: Response): Promise<string> {
  const raw = await res.text();
  return raw
    .split('\n\n')
    .filter((e) => e.startsWith('data: ') && e !== 'data: [DONE]')
    .map((e) => JSON.parse(e.slice(6)).choices[0].delta.content ?? '')
    .join('');
}

async function* gen(parts: string[]) {
  for (const p of parts) yield p;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallByConversation.mockResolvedValue(ACTIVE_CALL);
  getChat.mockResolvedValue({
    chat: { id: 'chat-1' },
    messages: [
      { id: 'm1', chatId: 'chat-1', role: 'user', parts: [{ type: 'text', text: 'earlier question' }], order: 0, createdAt: new Date() },
    ],
  });
  resolvePersonaForChat.mockResolvedValue({ content: { basicInfo: 'published' } });
  resolveChatSkaProfile.mockResolvedValue(undefined);
  buildChatStream.mockImplementation(async () => ({
    textStream: gen(['<emotion value="content"/>', 'Vref is ', 'reference speed.']),
  }));
});

describe('tavusCompletionsHandler', () => {
  it('401 with the wrong secret', async () => {
    const res = await tavusCompletionsHandler(req({ auth: 'Bearer nope' }));
    expect(res.status).toBe(401);
    expect(getCallByConversation).not.toHaveBeenCalled();
  });

  it('401 for an unknown conversation', async () => {
    getCallByConversation.mockResolvedValueOnce(null);
    const res = await tavusCompletionsHandler(req());
    expect(res.status).toBe(401);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('401 for an ended call', async () => {
    getCallByConversation.mockResolvedValueOnce({ ...ACTIVE_CALL, status: 'ended' });
    const res = await tavusCompletionsHandler(req());
    expect(res.status).toBe(401);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it("answers Tavus's configuration check without a database lookup", async () => {
    const res = await tavusCompletionsHandler(req({ conv: 'tavus-openai-compat-test' }));
    expect(res.status).toBe(200);
    expect(await spokenText(res)).toBe('Custom LLM configuration test successful.');
    expect(getCallByConversation).not.toHaveBeenCalled();
  });

  it("gives buildChatStream the call's learner, course, persona and cleaned history", async () => {
    const res = await tavusCompletionsHandler(req());
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await spokenText(res)).toBe('<emotion value="content"/>Vref is reference speed.');

    expect(resolvePersonaForChat).toHaveBeenCalledWith({ orgId: 7, courseSlug: 'ppl' });
    expect(resolveChatSkaProfile).toHaveBeenCalledWith({ userId: 'u1', courseSlug: 'ppl' });
    expect(getChat).toHaveBeenCalledWith('u1', 'chat-1');

    const args = buildChatStream.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      userId: 'u1',
      courseSlug: 'ppl',
      persona: { basicInfo: 'published' },
      userInfo: { name: 'Rahul', callSign: 'unknown', location: 'unknown' },
      subscriptions: [],
    });
    expect(args.voice.tavusRules).toContain('EMOTION TAG');
    expect(args.voice.tavusRules).not.toContain(PERSONA_SENTINEL);
    expect(args.voice.tavusRules).not.toContain('Glasses');
    expect(args.messages.map((m: { role: string; parts: unknown }) => [m.role, m.parts])).toEqual([
      ['user', [{ type: 'text', text: 'earlier question' }]],
      ['assistant', [{ type: 'text', text: "Hi, it's Viper7." }]],
      ['user', [{ type: 'text', text: 'What is Vref?' }]],
    ]);
    expect(args.uiMessages).toBe(args.messages);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('speaks a short line without calling the model when the learner has not spoken', async () => {
    const res = await tavusCompletionsHandler(
      req({ body: { messages: [BODY.messages[0], BODY.messages[1]] } }),
    );
    expect(await spokenText(res)).toBe(VOICE_NO_TURN_REPLY);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('speaks the fallback when generation fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    buildChatStream.mockRejectedValueOnce(new Error('model down'));
    const res = await tavusCompletionsHandler(req());
    expect(await spokenText(res)).toBe(VOICE_FALLBACK_REPLY);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('400 on a malformed body', async () => {
    const res = await tavusCompletionsHandler(req({ body: { nope: true } }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run src/routes/api/__tests__/tavus-completions.test.ts`
Expected: FAIL — cannot resolve `../tavus/v1/chat/completions`.

- [ ] **Step 3: Implement**

`src/routes/api/tavus/v1/chat/completions.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import type { UIMessage } from 'ai';
import { buildChatStream } from '#/ai/chat';
import { VOICE_FALLBACK_REPLY, VOICE_NO_TURN_REPLY } from '#/ai/prompts/voice-mode';
import { getChat } from '#/db/chat';
import { resolvePersonaForChat } from '#/db/course-orgs';
import { getCallByConversation } from '#/db/video-calls';
import { env } from '#/env';
import { getActiveOrgId } from '#/lib/active-org.server';
import { openAISseResponse, toOpenAIChatCompletionStream } from '#/lib/openai-sse';
import { secretMatches } from '#/lib/secret-matches.server';
import { resolveChatSkaProfile } from '#/lib/ska-profile.server';
import {
  splitTavusMessages,
  TAVUS_CONFIG_CHECK_ID,
  tavusCompletionRequestSchema,
} from '#/lib/tavus-messages';

const MODEL = 'viper7';

async function* once(text: string) {
  yield text;
}

/**
 * Tavus's custom-LLM endpoint: the brain behind the video replica.
 *
 * Tavus has no user session, so identity comes from the `conversation-id`
 * header (verified in the spike) looked up against an ACTIVE `video_calls`
 * row, behind the persona's bearer secret. From there it is `/api/chat`'s
 * context — org persona, SKA profile, course-scoped searchKB with gating —
 * plus the chat's persisted messages so the call knows the text conversation
 * that preceded it. Nothing is persisted here: replies can be interrupted
 * mid-stream, so the transcript is taken from Tavus after the call.
 */
export async function tavusCompletionsHandler(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!secretMatches(authorization, `Bearer ${env.TAVUS_LLM_SECRET}`)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = tavusCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const conversationId =
    request.headers.get('conversation-id') ?? request.headers.get('conversation_id');

  if (conversationId === TAVUS_CONFIG_CHECK_ID) {
    return openAISseResponse(
      toOpenAIChatCompletionStream(
        async () => once('Custom LLM configuration test successful.'),
        { model: MODEL, fallbackText: '' },
      ),
    );
  }

  const call = conversationId ? await getCallByConversation(conversationId) : null;
  if (!call || call.status !== 'active') {
    return new Response('Unauthorized', { status: 401 });
  }

  const { tavusRules, history } = splitTavusMessages(parsed.data.messages);
  const courseSlug = call.courseSlug ?? undefined;

  const stream = toOpenAIChatCompletionStream(
    async () => {
      if (!history.some((m) => m.role === 'user')) return once(VOICE_NO_TURN_REPLY);

      const [persona, skaProfile, chat] = await Promise.all([
        resolvePersonaForChat({ orgId: getActiveOrgId(), courseSlug }),
        resolveChatSkaProfile({ userId: call.userId, courseSlug }),
        getChat(call.userId, call.chatId),
      ]);
      const prior: UIMessage[] = (chat?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as UIMessage['role'],
        parts: m.parts as UIMessage['parts'],
      }));
      const messages = [...prior, ...history];

      const result = await buildChatStream({
        messages,
        uiMessages: messages,
        persona: persona?.content,
        userInfo: { name: call.userName ?? 'unknown', callSign: 'unknown', location: 'unknown' },
        // Same as /api/chat until a subscriptions reader exists.
        subscriptions: [],
        courseSlug,
        userId: call.userId,
        skaProfile,
        voice: { tavusRules },
        abortSignal: request.signal,
      });
      return result.textStream;
    },
    {
      model: MODEL,
      fallbackText: VOICE_FALLBACK_REPLY,
      signal: request.signal,
      onError: (err) => console.error('tavus completion failed', err),
    },
  );

  return openAISseResponse(stream);
}

export const Route = createFileRoute('/api/tavus/v1/chat/completions')({
  server: {
    handlers: {
      POST: ({ request }) => tavusCompletionsHandler(request),
    },
  },
});
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm vitest run src/routes/api/__tests__/tavus-completions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/tavus/v1/chat/completions.ts src/routes/api/__tests__/tavus-completions.test.ts
git commit -m "feat(video-call): Tavus custom-LLM completions endpoint"
```

---

### Task 8: Reconcile a call with Tavus

**Files:**
- Create: `src/lib/video-call-reconcile.server.ts`
- Test: `src/lib/__tests__/video-call-reconcile.test.ts`

**Interfaces:**
- Consumes: `getConversation` (T2), `getCallById`, `markCallEnded`, `saveTranscriptOnce`, `VideoCall` (T3), `mapShutdownReason`, `transcriptToMessages` (T4), `clampDuration` (T1).
- Produces: `reconcileVideoCall(call: VideoCall): Promise<VideoCall>` — idempotent; returns the latest row.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/video-call-reconcile.test.ts`:
```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversation, getCallById, markCallEnded, saveTranscriptOnce } = vi.hoisted(() => ({
  getConversation: vi.fn(),
  getCallById: vi.fn(),
  markCallEnded: vi.fn(),
  saveTranscriptOnce: vi.fn(),
}));
vi.mock('#/lib/tavus.server', () => ({ getConversation }));
vi.mock('#/db/video-calls', () => ({ getCallById, markCallEnded, saveTranscriptOnce }));

import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

const STARTED = new Date('2026-10-06T12:00:00Z');
const ACTIVE = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: null,
  tavusConversationId: 'conv-1',
  status: 'active' as const,
  reservedSeconds: 600,
  startedAt: STARTED,
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  markCallEnded.mockResolvedValue(true);
  saveTranscriptOnce.mockResolvedValue(true);
});

describe('reconcileVideoCall', () => {
  it('records a time-limit shutdown with the clamped duration', async () => {
    getConversation.mockResolvedValue({
      status: 'ended',
      shutdown: { at: new Date('2026-10-06T12:10:03Z'), reason: 'max_call_duration' },
      transcript: null,
    });
    getCallById.mockResolvedValue({ ...ACTIVE, status: 'ended' });

    await reconcileVideoCall(ACTIVE);

    expect(markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: new Date('2026-10-06T12:10:03Z'),
      durationSeconds: 600,
      endReason: 'time_limit',
    });
    expect(saveTranscriptOnce).not.toHaveBeenCalled();
  });

  it('appends the cleaned transcript to the call chat once ended', async () => {
    const ended = { ...ACTIVE, status: 'ended' as const, durationSeconds: 480, endReason: 'user' as const };
    getConversation.mockResolvedValue({
      status: 'ended',
      shutdown: { at: new Date('2026-10-06T12:08:00Z'), reason: 'end_call_endpoint_hit' },
      transcript: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'What is Vref?' },
        { role: 'assistant', content: '<emotion value="content"/>Reference speed.' },
      ],
    });
    getCallById.mockResolvedValue(ended);

    await reconcileVideoCall(ended);

    expect(markCallEnded).not.toHaveBeenCalled();
    expect(saveTranscriptOnce).toHaveBeenCalledWith('vc1', 'chat-1', [
      { role: 'assistant', parts: [{ type: 'data-notification', data: { text: 'Video call with Viper7' } }] },
      { role: 'user', parts: [{ type: 'text', text: 'What is Vref?' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Reference speed.' }] },
      { role: 'assistant', parts: [{ type: 'data-notification', data: { text: 'Video call ended · 8 min' } }] },
    ]);
  });

  it('does nothing while Tavus still has the call running', async () => {
    getConversation.mockResolvedValue({ status: 'active', shutdown: null, transcript: null });
    getCallById.mockResolvedValue(ACTIVE);
    const result = await reconcileVideoCall(ACTIVE);
    expect(markCallEnded).not.toHaveBeenCalled();
    expect(saveTranscriptOnce).not.toHaveBeenCalled();
    expect(result.status).toBe('active');
  });

  it('skips Tavus entirely once the transcript is saved', async () => {
    const done = { ...ACTIVE, status: 'ended' as const, transcriptSavedAt: new Date() };
    expect(await reconcileVideoCall(done)).toBe(done);
    expect(getConversation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/video-call-reconcile.test.ts`
Expected: FAIL — cannot resolve `#/lib/video-call-reconcile.server`.

- [ ] **Step 3: Implement**

`src/lib/video-call-reconcile.server.ts`:
```ts
import {
  getCallById,
  markCallEnded,
  saveTranscriptOnce,
  type VideoCall,
} from '#/db/video-calls';
import { mapShutdownReason, transcriptToMessages } from '#/lib/tavus-messages';
import { getConversation } from '#/lib/tavus.server';
import { clampDuration } from '#/lib/video-call-allowance';

/**
 * Brings one `video_calls` row in line with Tavus: marks it ended (with the
 * real duration and reason) once Tavus has shut the call down, and appends
 * the transcript once Tavus has it. Called from the webhook, the end route,
 * status polling and the start route's leftover-call check — every step is
 * idempotent (`markCallEnded` only moves active rows; `saveTranscriptOnce`
 * claims before it inserts).
 */
export async function reconcileVideoCall(call: VideoCall): Promise<VideoCall> {
  if (call.status === 'ended' && call.transcriptSavedAt) return call;

  const conversation = await getConversation(call.tavusConversationId);

  if (call.status === 'active' && conversation.status === 'ended') {
    const endedAt = conversation.shutdown?.at ?? new Date();
    await markCallEnded(call.id, {
      endedAt,
      durationSeconds: clampDuration(call.startedAt, endedAt, call.reservedSeconds),
      endReason: mapShutdownReason(conversation.shutdown?.reason),
    });
  }

  const latest = (await getCallById(call.id)) ?? call;

  if (latest.status === 'ended' && !latest.transcriptSavedAt && conversation.transcript) {
    await saveTranscriptOnce(
      latest.id,
      latest.chatId,
      transcriptToMessages(conversation.transcript, {
        durationSeconds: latest.durationSeconds,
        endReason: latest.endReason,
      }),
    );
    return (await getCallById(call.id)) ?? latest;
  }

  return latest;
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm vitest run src/lib/__tests__/video-call-reconcile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-call-reconcile.server.ts src/lib/__tests__/video-call-reconcile.test.ts
git commit -m "feat(video-call): reconcile calls and transcripts with Tavus"
```

---

### Task 9: Call lifecycle routes (allowance, start, status, end) and the webhook

**Files:**
- Create: `src/lib/video-call-service.server.ts`, `src/routes/api/video-call.ts`, `src/routes/api/video-call.allowance.ts`, `src/routes/api/video-call.$id.ts`, `src/routes/api/video-call.$id.end.ts`, `src/routes/api/tavus/webhook.ts`
- Test: `src/routes/api/__tests__/video-call.test.ts`, `src/routes/api/__tests__/tavus-webhook.test.ts`

**Interfaces:**
- Consumes: T1 (`computeAllowance`, `utcDayWindow`, `isStale`, `clampDuration`, schemas), T2 (`createConversation`, `endConversation`, `secretMatches`, `env`), T3 queries, T6 `VIDEO_CALL_GREETING`, T8 `reconcileVideoCall`, `ensureChat`, `auth`.
- Produces: `settleActiveCall(userId: string, now: Date): Promise<VideoCall | null>`, `loadAllowance(userId: string, now: Date): Promise<{ allowance: Allowance; activeCall: VideoCall | null }>`, `toAllowanceResponse(input: { allowance: Allowance; activeCall: VideoCall | null; configured: boolean }): AllowanceResponse`, `toStatusResponse(call: VideoCall): VideoCallStatusResponse`.
- Produces handlers: `getAllowanceHandler`, `startVideoCallHandler`, `getVideoCallHandler(request, id)`, `endVideoCallHandler(request, id)`, `tavusWebhookHandler`.

- [ ] **Step 1: Write the failing route tests**

`src/routes/api/__tests__/video-call.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  envMock: {
    TAVUS_PERSONA_ID: 'p1' as string | undefined,
    TAVUS_LLM_SECRET: 's'.repeat(32),
    TAVUS_PUBLIC_URL: 'https://pub.example',
  },
  getSession: vi.fn(),
  ensureChat: vi.fn(),
  createConversation: vi.fn(),
  endConversation: vi.fn(),
  reconcileVideoCall: vi.fn(),
  listCallsSince: vi.fn(),
  getActiveCallForUser: vi.fn(),
  getCallForUser: vi.fn(),
  getCallById: vi.fn(),
  insertActiveCall: vi.fn(),
  markCallEnded: vi.fn(),
}));
vi.mock('#/env', () => ({ env: m.envMock }));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/chat', () => ({ ensureChat: m.ensureChat }));
vi.mock('#/lib/tavus.server', () => ({
  createConversation: m.createConversation,
  endConversation: m.endConversation,
}));
vi.mock('#/lib/video-call-reconcile.server', () => ({ reconcileVideoCall: m.reconcileVideoCall }));
vi.mock('#/db/video-calls', () => ({
  listCallsSince: m.listCallsSince,
  getActiveCallForUser: m.getActiveCallForUser,
  getCallForUser: m.getCallForUser,
  getCallById: m.getCallById,
  insertActiveCall: m.insertActiveCall,
  markCallEnded: m.markCallEnded,
}));

import { VIDEO_CALL_GREETING } from '#/ai/prompts/voice-mode';
import { startVideoCallHandler } from '../video-call';
import { getVideoCallHandler } from '../video-call.$id';
import { endVideoCallHandler } from '../video-call.$id.end';
import { getAllowanceHandler } from '../video-call.allowance';

const NOW = new Date('2026-10-06T12:00:00Z');
const CALL = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: 'ppl',
  tavusConversationId: 'conv-1',
  status: 'active' as const,
  reservedSeconds: 600,
  startedAt: new Date('2026-10-06T11:58:30Z'),
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};
const ended = (durationSeconds: number) => ({
  ...CALL,
  id: `old-${durationSeconds}`,
  status: 'ended' as const,
  durationSeconds,
});

const post = (url: string, body: unknown = {}) =>
  new Request(`http://t${url}`, { method: 'POST', body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://t${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  m.envMock.TAVUS_PERSONA_ID = 'p1';
  m.getSession.mockResolvedValue({ user: { id: 'u1', name: 'Rahul' } });
  m.getActiveCallForUser.mockResolvedValue(null);
  m.listCallsSince.mockResolvedValue([]);
  m.ensureChat.mockResolvedValue('chat-1');
  m.createConversation.mockResolvedValue({
    conversationId: 'conv-new',
    conversationUrl: 'https://tavus.daily.co/conv-new',
  });
  m.insertActiveCall.mockImplementation(async (values: Record<string, unknown>) => ({
    ...CALL,
    ...values,
    id: 'vc-new',
    startedAt: NOW,
  }));
  m.markCallEnded.mockResolvedValue(true);
  m.endConversation.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('GET /api/video-call/allowance', () => {
  it('401 without a session', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect((await getAllowanceHandler(get('/api/video-call/allowance'))).status).toBe(401);
  });

  it('gives a fresh user the full day', async () => {
    const res = await getAllowanceHandler(get('/api/video-call/allowance'));
    expect(await res.json()).toEqual({
      canStart: true,
      reason: null,
      remainingSeconds: 1800,
      resetsAt: '2026-10-07T00:00:00.000Z',
      activeCallId: null,
    });
  });

  it('says not_configured when no persona id is set', async () => {
    m.envMock.TAVUS_PERSONA_ID = undefined;
    const body = await (await getAllowanceHandler(get('/api/video-call/allowance'))).json();
    expect(body).toMatchObject({ canStart: false, reason: 'not_configured' });
  });

  it('listCallsSince is queried from 00:00 UTC today', async () => {
    vi.setSystemTime(new Date('2026-10-07T00:01:00Z'));
    await getAllowanceHandler(get('/api/video-call/allowance'));
    expect(m.listCallsSince).toHaveBeenCalledWith('u1', new Date('2026-10-07T00:00:00Z'));
  });
});

describe('POST /api/video-call', () => {
  it('reserves what is left today and tells Tavus the same limit', async () => {
    m.listCallsSince.mockResolvedValue([ended(1500)]);
    const res = await startVideoCallHandler(post('/api/video-call', { chatId: 'chat-1', courseSlug: 'ppl' }));

    expect(res.status).toBe(200);
    expect(m.createConversation).toHaveBeenCalledWith({
      personaId: 'p1',
      callbackUrl: `https://pub.example/api/tavus/webhook?token=${'s'.repeat(32)}`,
      maxCallDurationSeconds: 300,
      customGreeting: VIDEO_CALL_GREETING,
    });
    expect(m.ensureChat).toHaveBeenCalledWith({
      chatId: 'chat-1',
      userId: 'u1',
      firstUserText: 'Video call with Viper7',
    });
    expect(m.insertActiveCall).toHaveBeenCalledWith({
      userId: 'u1',
      userName: 'Rahul',
      chatId: 'chat-1',
      courseSlug: 'ppl',
      tavusConversationId: 'conv-new',
      reservedSeconds: 300,
    });
    expect(await res.json()).toEqual({
      id: 'vc-new',
      chatId: 'chat-1',
      conversationUrl: 'https://tavus.daily.co/conv-new',
      endsAt: '2026-10-06T12:05:00.000Z',
    });
  });

  it('403 daily_limit without creating a Tavus call', async () => {
    m.listCallsSince.mockResolvedValue([ended(1750)]);
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ reason: 'daily_limit', resetsAt: '2026-10-07T00:00:00.000Z' });
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('503 not_configured without creating a Tavus call', async () => {
    m.envMock.TAVUS_PERSONA_ID = undefined;
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(503);
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('start proceeds when the leftover active call has ended at Tavus', async () => {
    m.getActiveCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValue({ ...CALL, status: 'ended', durationSeconds: 60 });
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(m.reconcileVideoCall).toHaveBeenCalledWith(CALL);
    expect(res.status).toBe(200);
    expect(m.createConversation).toHaveBeenCalled();
  });

  it('409 when a call is genuinely live elsewhere', async () => {
    m.getActiveCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValue(CALL);
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ reason: 'already_active' });
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('marks an abandoned call stale when Tavus cannot be reached', async () => {
    const old = { ...CALL, startedAt: new Date('2026-10-06T11:40:00Z') };
    m.getActiveCallForUser.mockResolvedValue(old);
    m.reconcileVideoCall.mockRejectedValue(new Error('tavus down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startVideoCallHandler(post('/api/video-call'));
    expect(m.markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: NOW,
      durationSeconds: 600,
      endReason: 'stale',
    });
  });

  it('409 and ends the orphaned Tavus call when a parallel start wins the race', async () => {
    m.insertActiveCall.mockResolvedValue('already_active');
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(409);
    expect(m.endConversation).toHaveBeenCalledWith('conv-new');
  });

  it('502 and no chat or row when Tavus refuses', async () => {
    m.createConversation.mockRejectedValue(new Error('402'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ reason: 'provider_unavailable' });
    expect(m.ensureChat).not.toHaveBeenCalled();
    expect(m.insertActiveCall).not.toHaveBeenCalled();
  });
});

describe('GET /api/video-call/:id', () => {
  it("404 for another user's call", async () => {
    m.getCallForUser.mockResolvedValue(null);
    const res = await getVideoCallHandler(get('/api/video-call/vc1'), 'vc1');
    expect(res.status).toBe(404);
    expect(m.getCallForUser).toHaveBeenCalledWith('vc1', 'u1');
    expect(m.reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('reconciles while the transcript is unsaved and reports the result', async () => {
    m.getCallForUser.mockResolvedValue({ ...CALL, status: 'ended' });
    m.reconcileVideoCall.mockResolvedValue({
      ...CALL,
      status: 'ended',
      durationSeconds: 90,
      endReason: 'user',
      transcriptSavedAt: NOW,
    });
    const res = await getVideoCallHandler(get('/api/video-call/vc1'), 'vc1');
    expect(await res.json()).toEqual({
      status: 'ended',
      endReason: 'user',
      durationSeconds: 90,
      transcriptSaved: true,
      chatId: 'chat-1',
    });
  });
});

describe('POST /api/video-call/:id/end', () => {
  it("404 for another user's call without touching Tavus", async () => {
    m.getCallForUser.mockResolvedValue(null);
    const res = await endVideoCallHandler(post('/api/video-call/vc1/end'), 'vc1');
    expect(res.status).toBe(404);
    expect(m.endConversation).not.toHaveBeenCalled();
  });

  it('ends at Tavus and records the user hang-up with the real duration', async () => {
    m.getCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValueOnce(CALL);
    m.getCallById.mockResolvedValue({ ...CALL, status: 'ended', durationSeconds: 90, endReason: 'user' });
    const res = await endVideoCallHandler(post('/api/video-call/vc1/end'), 'vc1');

    expect(m.endConversation).toHaveBeenCalledWith('conv-1');
    expect(m.markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: NOW,
      durationSeconds: 90,
      endReason: 'user',
    });
    expect(await res.json()).toMatchObject({ status: 'ended', durationSeconds: 90 });
  });
});
```

`src/routes/api/__tests__/tavus-webhook.test.ts`:
```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCallByConversation, reconcileVideoCall } = vi.hoisted(() => ({
  getCallByConversation: vi.fn(),
  reconcileVideoCall: vi.fn(),
}));
vi.mock('#/env', () => ({ env: { TAVUS_LLM_SECRET: 's'.repeat(32) } }));
vi.mock('#/db/video-calls', () => ({ getCallByConversation }));
vi.mock('#/lib/video-call-reconcile.server', () => ({ reconcileVideoCall }));

import { tavusWebhookHandler } from '../tavus/webhook';

const SECRET = 's'.repeat(32);
const hook = (token: string, body: unknown) =>
  new Request(`http://t/api/tavus/webhook?token=${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCallByConversation.mockResolvedValue({ id: 'vc1', tavusConversationId: 'conv-1' });
  reconcileVideoCall.mockResolvedValue({});
});

describe('tavusWebhookHandler', () => {
  it('401 with the wrong token', async () => {
    const res = await tavusWebhookHandler(hook('nope', { conversation_id: 'conv-1', event_type: 'system.shutdown' }));
    expect(res.status).toBe(401);
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('reconciles the matching call on shutdown and transcript events', async () => {
    for (const event_type of ['system.shutdown', 'application.transcription_ready']) {
      const res = await tavusWebhookHandler(hook(SECRET, { conversation_id: 'conv-1', event_type }));
      expect(res.status).toBe(200);
    }
    expect(getCallByConversation).toHaveBeenCalledWith('conv-1');
    expect(reconcileVideoCall).toHaveBeenCalledTimes(2);
    expect(reconcileVideoCall).toHaveBeenCalledWith({ id: 'vc1', tavusConversationId: 'conv-1' });
  });

  it('ignores other events and unknown conversations', async () => {
    await tavusWebhookHandler(hook(SECRET, { conversation_id: 'conv-1', event_type: 'system.replica_joined' }));
    getCallByConversation.mockResolvedValueOnce(null);
    await tavusWebhookHandler(hook(SECRET, { conversation_id: 'zzz', event_type: 'system.shutdown' }));
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `pnpm vitest run src/routes/api/__tests__/video-call.test.ts src/routes/api/__tests__/tavus-webhook.test.ts`
Expected: FAIL — cannot resolve `../video-call` / `../tavus/webhook`.

- [ ] **Step 3: Implement the service**

`src/lib/video-call-service.server.ts`:
```ts
import {
  getActiveCallForUser,
  listCallsSince,
  markCallEnded,
  type VideoCall,
} from '#/db/video-calls';
import {
  type Allowance,
  computeAllowance,
  isStale,
  utcDayWindow,
} from '#/lib/video-call-allowance';
import type {
  AllowanceResponse,
  VideoCallStatusResponse,
} from '#/lib/video-call-contract';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

/**
 * Returns the user's genuinely live call, or null. A leftover `active` row
 * (closed tab) is first reconciled with Tavus, which ends abandoned calls
 * ~30 s after the learner leaves — so a learner can retry within a minute
 * rather than waiting out the stale window. The stale window is only the
 * fallback for when Tavus can't be reached.
 */
export async function settleActiveCall(userId: string, now: Date): Promise<VideoCall | null> {
  const active = await getActiveCallForUser(userId);
  if (!active) return null;

  try {
    const latest = await reconcileVideoCall(active);
    if (latest.status === 'ended') return null;
  } catch (err) {
    console.error('video call reconcile failed', err);
  }

  if (isStale(active, now)) {
    await markCallEnded(active.id, {
      endedAt: now,
      durationSeconds: active.reservedSeconds,
      endReason: 'stale',
    });
    return null;
  }
  return active;
}

export async function loadAllowance(
  userId: string,
  now: Date,
): Promise<{ allowance: Allowance; activeCall: VideoCall | null }> {
  const activeCall = await settleActiveCall(userId, now);
  const rows = await listCallsSince(userId, utcDayWindow(now).start);
  return { allowance: computeAllowance(rows, now), activeCall };
}

export function toAllowanceResponse(input: {
  allowance: Allowance;
  activeCall: VideoCall | null;
  configured: boolean;
}): AllowanceResponse {
  const { allowance, activeCall, configured } = input;
  const reason = !configured
    ? 'not_configured'
    : activeCall
      ? 'already_active'
      : allowance.canStart
        ? null
        : 'daily_limit';
  return {
    canStart: reason === null,
    reason,
    remainingSeconds: allowance.remainingSeconds,
    resetsAt: allowance.resetsAt.toISOString(),
    activeCallId: activeCall?.id ?? null,
  };
}

export function toStatusResponse(call: VideoCall): VideoCallStatusResponse {
  return {
    status: call.status,
    endReason: call.endReason,
    durationSeconds: call.durationSeconds,
    transcriptSaved: call.transcriptSavedAt !== null,
    chatId: call.chatId,
  };
}
```

- [ ] **Step 4: Implement the routes**

`src/routes/api/video-call.allowance.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { env } from '#/env';
import { auth } from '#/lib/auth';
import { loadAllowance, toAllowanceResponse } from '#/lib/video-call-service.server';

/** Drives the video button's locked state. The start route re-checks
 * everything, so a stale answer here can never let a call through. */
export async function getAllowanceHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { allowance, activeCall } = await loadAllowance(session.user.id, new Date());
  return Response.json(
    toAllowanceResponse({ allowance, activeCall, configured: Boolean(env.TAVUS_PERSONA_ID) }),
  );
}

export const Route = createFileRoute('/api/video-call/allowance')({
  server: { handlers: { GET: ({ request }) => getAllowanceHandler(request) } },
});
```

`src/routes/api/video-call.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { addSeconds } from 'date-fns';
import { VIDEO_CALL_GREETING } from '#/ai/prompts/voice-mode';
import { ensureChat } from '#/db/chat';
import { insertActiveCall } from '#/db/video-calls';
import { env } from '#/env';
import { auth } from '#/lib/auth';
import { createConversation, endConversation } from '#/lib/tavus.server';
import { startRequestSchema, type StartResponse } from '#/lib/video-call-contract';
import { loadAllowance } from '#/lib/video-call-service.server';

/**
 * Starts a Tavus video call. Order matters: every refusal (not configured,
 * live call elsewhere, daily limit) happens before Tavus is asked for a
 * conversation, and the chat row is only created once Tavus has said yes,
 * so a refusal leaves nothing behind. The unique active-call index is the
 * race guard: if a parallel start wins, this one ends its Tavus call and 409s.
 */
export async function startVideoCallHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is a valid start with no chat or course in context.
  }
  const parsed = startRequestSchema.safeParse(body ?? {});
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });

  const personaId = env.TAVUS_PERSONA_ID;
  if (!personaId) return Response.json({ reason: 'not_configured' }, { status: 503 });

  const userId = session.user.id;
  const now = new Date();
  const { allowance, activeCall } = await loadAllowance(userId, now);
  if (activeCall) return Response.json({ reason: 'already_active' }, { status: 409 });
  if (!allowance.canStart) {
    return Response.json(
      { reason: 'daily_limit', resetsAt: allowance.resetsAt.toISOString() },
      { status: 403 },
    );
  }

  const reservedSeconds = allowance.reservedSecondsIfStarted;
  let conversation: { conversationId: string; conversationUrl: string };
  try {
    conversation = await createConversation({
      personaId,
      callbackUrl: `${env.TAVUS_PUBLIC_URL}/api/tavus/webhook?token=${encodeURIComponent(env.TAVUS_LLM_SECRET)}`,
      maxCallDurationSeconds: reservedSeconds,
      customGreeting: VIDEO_CALL_GREETING,
    });
  } catch (err) {
    console.error('tavus create conversation failed', err);
    return Response.json({ reason: 'provider_unavailable' }, { status: 502 });
  }

  const chatId = await ensureChat({
    chatId: parsed.data.chatId,
    userId,
    firstUserText: 'Video call with Viper7',
  });

  const inserted = await insertActiveCall({
    userId,
    userName: session.user.name ?? null,
    chatId,
    courseSlug: parsed.data.courseSlug ?? null,
    tavusConversationId: conversation.conversationId,
    reservedSeconds,
  });
  if (inserted === 'already_active') {
    await endConversation(conversation.conversationId).catch((err) =>
      console.error('tavus end orphaned conversation failed', err),
    );
    return Response.json({ reason: 'already_active' }, { status: 409 });
  }

  const response: StartResponse = {
    id: inserted.id,
    chatId,
    conversationUrl: conversation.conversationUrl,
    endsAt: addSeconds(inserted.startedAt, reservedSeconds).toISOString(),
  };
  return Response.json(response);
}

export const Route = createFileRoute('/api/video-call')({
  server: { handlers: { POST: ({ request }) => startVideoCallHandler(request) } },
});
```

`src/routes/api/video-call.$id.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { getCallForUser } from '#/db/video-calls';
import { auth } from '#/lib/auth';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';
import { toStatusResponse } from '#/lib/video-call-service.server';

/** Polled by the client after hang-up until the transcript is saved; each
 * poll reconciles with Tavus, so the transcript arrives even if the webhook
 * never does. */
export async function getVideoCallHandler(request: Request, id: string): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const call = await getCallForUser(id, session.user.id);
  if (!call) return new Response('Not found', { status: 404 });

  const latest = call.transcriptSavedAt
    ? call
    : await reconcileVideoCall(call).catch((err) => {
        console.error('video call reconcile failed', err);
        return call;
      });
  return Response.json(toStatusResponse(latest));
}

export const Route = createFileRoute('/api/video-call/$id')({
  server: {
    handlers: { GET: ({ request, params }) => getVideoCallHandler(request, params.id) },
  },
});
```

`src/routes/api/video-call.$id.end.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { getCallById, getCallForUser, markCallEnded } from '#/db/video-calls';
import { auth } from '#/lib/auth';
import { endConversation } from '#/lib/tavus.server';
import { clampDuration } from '#/lib/video-call-allowance';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';
import { toStatusResponse } from '#/lib/video-call-service.server';

/** The learner hung up. Reconciles first so a call Tavus already ended (time
 * limit) keeps its real reason; otherwise ends it at Tavus and records
 * `user` with the real duration, giving unused minutes back. */
export async function endVideoCallHandler(request: Request, id: string): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const call = await getCallForUser(id, session.user.id);
  if (!call) return new Response('Not found', { status: 404 });

  const settled = await reconcileVideoCall(call).catch((err) => {
    console.error('video call reconcile failed', err);
    return call;
  });

  if (settled.status === 'active') {
    await endConversation(call.tavusConversationId).catch((err) =>
      console.error('tavus end conversation failed', err),
    );
    const now = new Date();
    await markCallEnded(call.id, {
      endedAt: now,
      durationSeconds: clampDuration(call.startedAt, now, call.reservedSeconds),
      endReason: 'user',
    });
  }

  return Response.json(toStatusResponse((await getCallById(call.id)) ?? settled));
}

export const Route = createFileRoute('/api/video-call/$id/end')({
  server: {
    handlers: { POST: ({ request, params }) => endVideoCallHandler(request, params.id) },
  },
});
```

`src/routes/api/tavus/webhook.ts`:
```ts
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getCallByConversation } from '#/db/video-calls';
import { env } from '#/env';
import { secretMatches } from '#/lib/secret-matches.server';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

const RECONCILE_EVENTS = new Set(['system.shutdown', 'application.transcription_ready']);
const webhookSchema = z.object({ conversation_id: z.string(), event_type: z.string() });

/**
 * Tavus `callback_url`. The body is only trusted for the conversation id:
 * reconcileVideoCall fetches the real state from Tavus's API with our key.
 * Always 200 for anything authenticated, so Tavus doesn't retry noise.
 */
export async function tavusWebhookHandler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!secretMatches(token, env.TAVUS_LLM_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = webhookSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !RECONCILE_EVENTS.has(parsed.data.event_type)) {
    return new Response(null, { status: 200 });
  }

  const call = await getCallByConversation(parsed.data.conversation_id);
  if (call) {
    await reconcileVideoCall(call).catch((err) =>
      console.error('tavus webhook reconcile failed', err),
    );
  }
  return new Response(null, { status: 200 });
}

export const Route = createFileRoute('/api/tavus/webhook')({
  server: { handlers: { POST: ({ request }) => tavusWebhookHandler(request) } },
});
```

- [ ] **Step 5: Run to confirm they pass**

Run: `pnpm vitest run src/routes/api/__tests__/video-call.test.ts src/routes/api/__tests__/tavus-webhook.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Verify the Review Focus tests go red without their fix**

Comment out the `try { … reconcileVideoCall … } catch { … }` block in `settleActiveCall`, run `video-call.test.ts`, and confirm `start proceeds when the leftover active call has ended at Tavus` FAILS. Uncomment it and confirm PASS. (The file is uncommitted at this point, so undo by hand, not with `git checkout`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-call-service.server.ts src/routes/api/video-call.ts src/routes/api/video-call.allowance.ts 'src/routes/api/video-call.$id.ts' 'src/routes/api/video-call.$id.end.ts' src/routes/api/tavus/webhook.ts src/routes/api/__tests__/video-call.test.ts src/routes/api/__tests__/tavus-webhook.test.ts
git commit -m "feat(video-call): allowance, start, status, end routes and Tavus webhook"
```

---

### Task 10: Persona sync script

**Files:**
- Create: `scripts/tavus-sync-persona.ts`
- Modify: `package.json` (script)

**Interfaces:**
- Consumes: `PERSONA_SENTINEL` (T4).
- Produces: `pnpm tavus:sync-persona` — creates (no `TAVUS_PERSONA_ID`) or updates the environment's persona; prints the id.

- [ ] **Step 1: Write the script**

`scripts/tavus-sync-persona.ts`:
```ts
/**
 * Creates or updates this environment's Tavus persona so its custom-LLM
 * layer points at our completions endpoint.
 *
 *   pnpm tavus:sync-persona
 *
 * Needs TAVUS_API_KEY, TAVUS_REPLICA_ID, TAVUS_LLM_SECRET, TAVUS_PUBLIC_URL.
 * Without TAVUS_PERSONA_ID it creates a persona and prints the id to add to
 * .env.local; with it, it updates that persona in place.
 *
 * Tavus probes the endpoint on create/update (conversation id
 * `tavus-openai-compat-test`), so the app must be reachable at
 * TAVUS_PUBLIC_URL when this runs (dev: `pnpm dev` + ngrok).
 */
import { z } from 'zod';
import { PERSONA_SENTINEL } from '#/lib/tavus-messages';

const cfg = z
  .object({
    TAVUS_API_KEY: z.string().min(1),
    TAVUS_REPLICA_ID: z.string().regex(/^r[0-9a-z]+$/),
    TAVUS_LLM_SECRET: z.string().min(32),
    TAVUS_PUBLIC_URL: z.url(),
    TAVUS_PERSONA_ID: z.string().regex(/^p[0-9a-z]+$/).optional(),
  })
  .parse(process.env);

const publicUrl = cfg.TAVUS_PUBLIC_URL.replace(/\/$/, '');
const llm = {
  model: 'viper7',
  base_url: `${publicUrl}/api/tavus/v1`,
  api_key: cfg.TAVUS_LLM_SECRET,
  speculative_inference: true,
};

async function tavus(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`https://tavusapi.com/v2${path}`, {
    ...init,
    headers: { 'x-api-key': cfg.TAVUS_API_KEY, 'content-type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok && res.status !== 304) {
    throw new Error(`Tavus ${init.method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  if (cfg.TAVUS_PERSONA_ID) {
    // Tavus PATCH /personas takes a JSON Patch document.
    await tavus(`/personas/${cfg.TAVUS_PERSONA_ID}`, {
      method: 'PATCH',
      body: JSON.stringify([
        { op: 'replace', path: '/system_prompt', value: PERSONA_SENTINEL },
        { op: 'replace', path: '/default_replica_id', value: cfg.TAVUS_REPLICA_ID },
        { op: 'replace', path: '/layers/llm', value: llm },
      ]),
    });
    console.info(`Updated persona ${cfg.TAVUS_PERSONA_ID} → ${llm.base_url}`);
    return;
  }

  const created = z.object({ persona_id: z.string() }).parse(
    await tavus('/personas', {
      method: 'POST',
      body: JSON.stringify({
        persona_name: `Viper7 (${new URL(publicUrl).host})`,
        system_prompt: PERSONA_SENTINEL,
        pipeline_mode: 'full',
        default_replica_id: cfg.TAVUS_REPLICA_ID,
        layers: { llm },
      }),
    }),
  );
  console.info(`Created persona. Add to .env.local:\nTAVUS_PERSONA_ID=${created.persona_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` `scripts`:
```json
"tavus:sync-persona": "dotenv -e .env.local -- tsx scripts/tavus-sync-persona.ts",
```

- [ ] **Step 2: Run it against dev**

1. Start the dev server (`pnpm dev`) and note the port it serves on. If it is 5000, macOS Control Center owns that port and answers 403 — use the port the app actually answers on (5001 on this machine).
2. `ngrok http <that port>` in another terminal; put its URL in `TAVUS_PUBLIC_URL` and restart the dev server.
3. `pnpm tavus:sync-persona`
Expected: `Created persona. Add to .env.local: TAVUS_PERSONA_ID=p…`. Add it, restart the dev server, run the script again: `Updated persona p… → https://…/api/tavus/v1`.

If PATCH returns 4xx, open https://docs.tavus.io/api-reference/personas/patch-persona, fix the patch document to match, and re-run. Do not hand-edit the persona in the dashboard.

- [ ] **Step 3: Commit**

```bash
git add scripts/tavus-sync-persona.ts package.json
git commit -m "feat(video-call): script to create/update the environment's Tavus persona"
```

---

### Task 11: A second floating window — geometry parameters

**Files:**
- Modify: `src/components/chat-widget/use-chat-window-geometry.ts`
- Test: `src/components/chat-widget/__tests__/use-chat-window-geometry.test.ts` (add a `describe`)

**Interfaces:**
- Produces: `useChatWindowGeometry(options?: { rectAtom?: typeof chatWidgetRectAtom; computeDefault?: (vp: Viewport) => ChatWindowRect })` (defaults keep the chat window unchanged); `computeDefaultVideoRect(vp: Viewport): ChatWindowRect`; constants `VIDEO_DEFAULT_WIDTH = 480`, `VIDEO_DEFAULT_HEIGHT = 360`, `WINDOW_GAP = 16`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/chat-widget/__tests__/use-chat-window-geometry.test.ts` (add `computeDefaultVideoRect` to the existing import from `#/components/chat-widget/use-chat-window-geometry`):
```ts
describe('computeDefaultVideoRect', () => {
  it('sits to the left of the default chat window, bottom-aligned', () => {
    expect(computeDefaultVideoRect({ width: 1440, height: 900 })).toEqual({
      width: 480,
      height: 360,
      left: 1440 - 24 - 400 - 16 - 480,
      top: 900 - 24 - 360,
    });
  });

  it('never leaves the margin on a narrow viewport', () => {
    const rect = computeDefaultVideoRect({ width: 700, height: 500 });
    expect(rect.left).toBe(24);
    expect(rect.width).toBe(480);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run src/components/chat-widget/__tests__/use-chat-window-geometry.test.ts`
Expected: FAIL — `computeDefaultVideoRect` is not exported.

- [ ] **Step 3: Implement**

In `use-chat-window-geometry.ts`, after `computeDefaultRect`, add:
```ts
export const VIDEO_DEFAULT_WIDTH = 480;
export const VIDEO_DEFAULT_HEIGHT = 360;
export const WINDOW_GAP = 16;

/** Default rect for the popped-out video window: beside the chat window's
 * default spot (to its inline-start side on screen), so popping out doesn't
 * cover the conversation. Physical `left` for the same reason as
 * computeDefaultRect: it's a viewport anchor, not a flow direction. */
export function computeDefaultVideoRect(vp: Viewport): ChatWindowRect {
  const width = Math.min(VIDEO_DEFAULT_WIDTH, vp.width - 2 * MARGIN);
  const height = Math.min(VIDEO_DEFAULT_HEIGHT, vp.height - 2 * MARGIN);
  return {
    width,
    height,
    left: Math.max(MARGIN, vp.width - MARGIN - DEFAULT_WIDTH - WINDOW_GAP - width),
    top: Math.max(MARGIN, vp.height - MARGIN - height),
  };
}
```
Change the hook's signature and the three uses of `chatWidgetRectAtom` / `computeDefaultRect` inside it:
```ts
export interface UseChatWindowGeometryOptions {
  /** Where this window's rect persists. Defaults to the chat window's. */
  rectAtom?: typeof chatWidgetRectAtom;
  /** Where this window opens before the user has moved it. */
  computeDefault?: (vp: Viewport) => ChatWindowRect;
}

export function useChatWindowGeometry({
  rectAtom = chatWidgetRectAtom,
  computeDefault = computeDefaultRect,
}: UseChatWindowGeometryOptions = {}): UseChatWindowGeometry {
  const [rect, setRect] = useAtom(rectAtom);
```
…and replace every `computeDefaultRect(getViewport())` inside the hook body (the layout effect, the resize listener, `reset`) with `computeDefault(getViewport())`, adding `computeDefault` to those `useLayoutEffect`/`useEffect`/`useCallback` dependency arrays.

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm vitest run src/components/chat-widget/__tests__/use-chat-window-geometry.test.ts`
Expected: PASS (existing skipped hook tests stay skipped).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-widget/use-chat-window-geometry.ts src/components/chat-widget/__tests__/use-chat-window-geometry.test.ts
git commit -m "refactor(chat-widget): window geometry takes its rect atom and default rect"
```

---

### Task 12: Client state and data layer

**Files:**
- Create: `src/atoms/video-call.ts`, `src/data-hooks/use-video-call.ts`
- Modify: `src/data-hooks/keys.ts`, `src/data-hooks/use-chat-messages.ts`, `src/components/chat-widget/use-chat-widget.ts`

**Interfaces:**
- Consumes: T1 contract schemas and types; `ChatWindowRect`.
- Produces atoms: `videoCallAtom: PrimitiveAtom<VideoCallState>` where `VideoCallState = { phase: VideoCallPhase; callId: string | null; chatId: string | null; endsAt: string | null; error: VideoCallErrorReason | null; resetsAt: string | null }`, `VideoCallPhase = 'idle' | 'requesting-media' | 'connecting' | 'live' | 'reconnecting' | 'ending' | 'ended' | 'error'`, `IDLE_VIDEO_CALL`, `videoDockedAtom`, `videoWindowRectAtom`, `videoMicMutedAtom`, `videoCameraOnAtom`, `videoRemoteStreamAtom`, `videoLocalStreamAtom`, `videoTranscriptAtom: PrimitiveAtom<'idle' | 'saving' | 'saved' | 'delayed'>`, `nowAtom` (ticks each second while subscribed), `wideViewportAtom` (≥ 640 px).
- Produces hooks: `useVideoCallAllowance(enabled: boolean)`, `useStartVideoCall()`, `useEndVideoCall()`, `fetchVideoCallStatus(id: string): Promise<VideoCallStatusResponse>`, `class VideoCallStartError extends Error { reason; resetsAt }`, `fetchChatWithMessages(chatId: string): Promise<ChatWithMessages>`.
- Produces from `useChatWidget()`: additionally `setMessages`, `getChatId(): string | undefined`, `adoptChatId(id: string): void`, `courseSlug: string | undefined`.
- Produces keys: `dataKeys.videoCallAllowance()`, `dataKeys.videoCall(id)`.

No new tests: everything here is hooks/atoms (render tests are blocked by the dup-React issue); the fetchers are exercised by Task 15's manual walkthrough. `tsc` must pass.

- [ ] **Step 1: Atoms**

`src/atoms/video-call.ts`:
```ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ChatWindowRect } from '#/atoms/chat-widget';
import type { VideoCallErrorReason } from '#/lib/video-call-copy';

export type VideoCallPhase =
  | 'idle'
  | 'requesting-media'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'error';

export interface VideoCallState {
  phase: VideoCallPhase;
  callId: string | null;
  chatId: string | null;
  endsAt: string | null;
  error: VideoCallErrorReason | null;
  resetsAt: string | null;
}

export const IDLE_VIDEO_CALL: VideoCallState = {
  phase: 'idle',
  callId: null,
  chatId: null,
  endsAt: null,
  error: null,
  resetsAt: null,
};

/** Not persisted: a call cannot survive a reload (the Daily call object lives in memory). */
export const videoCallAtom = atom<VideoCallState>(IDLE_VIDEO_CALL);
export const videoDockedAtom = atom(true);
export const videoMicMutedAtom = atom(false);
export const videoCameraOnAtom = atom(false);
export const videoRemoteStreamAtom = atom<MediaStream | null>(null);
export const videoLocalStreamAtom = atom<MediaStream | null>(null);
export const videoTranscriptAtom = atom<'idle' | 'saving' | 'saved' | 'delayed'>('idle');

/** Popped-out video window rect; persisted like the chat window's. */
export const videoWindowRectAtom = atomWithStorage<ChatWindowRect | null>(
  'video-window-rect',
  null,
  undefined,
  { getOnInit: true },
);

/** Wall clock that ticks once a second, only while something reads it
 * (the countdown) — so the rest of the widget doesn't re-render each second. */
const nowBaseAtom = atom(Date.now());
nowBaseAtom.onMount = (set) => {
  set(Date.now());
  const id = setInterval(() => set(Date.now()), 1000);
  return () => clearInterval(id);
};
export const nowAtom = atom((get) => get(nowBaseAtom));

const WIDE_QUERY = '(min-width: 640px)';
const wideViewportBaseAtom = atom(
  typeof window === 'undefined' ? true : window.matchMedia(WIDE_QUERY).matches,
);
wideViewportBaseAtom.onMount = (set) => {
  const mql = window.matchMedia(WIDE_QUERY);
  const onChange = () => set(mql.matches);
  onChange();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
/** Pop-out is offered only at ≥ 640 px. */
export const wideViewportAtom = atom((get) => get(wideViewportBaseAtom));
```

- [ ] **Step 2: Query keys and the exported chat fetcher**

In `src/data-hooks/keys.ts` add inside `dataKeys`:
```ts
  videoCallAllowance: () => ['video-call', 'allowance'] as const,
  videoCall: (id: string) => ['video-call', id] as const,
```
In `src/data-hooks/use-chat-messages.ts`, lift the `queryFn` body into an exported function and use it:
```ts
export async function fetchChatWithMessages(chatId: string): Promise<ChatWithMessages> {
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load chat (${res.status})`);
  }
  return chatWithMessagesSchema.parse(await res.json());
}
```
…and `queryFn: () => fetchChatWithMessages(chatId),`.

- [ ] **Step 3: Video call hooks**

`src/data-hooks/use-video-call.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allowanceResponseSchema,
  type StartRequest,
  startErrorResponseSchema,
  startResponseSchema,
  statusResponseSchema,
  type VideoCallStartErrorReason,
  type VideoCallStatusResponse,
} from '#/lib/video-call-contract';
import { dataKeys } from './keys';

export class VideoCallStartError extends Error {
  constructor(
    readonly reason: VideoCallStartErrorReason,
    readonly resetsAt: string | null,
  ) {
    super(`Video call could not start: ${reason}`);
    this.name = 'VideoCallStartError';
  }
}

/** Whether the video button is available. The server re-checks on start, so
 * a stale answer can only ever show a button that then explains its 403. */
export function useVideoCallAllowance(enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.videoCallAllowance(),
    queryFn: async () => {
      const res = await fetch('/api/video-call/allowance');
      if (!res.ok) throw new Error(`Failed to load video call allowance (${res.status})`);
      return allowanceResponseSchema.parse(await res.json());
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useStartVideoCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartRequest) => {
      const res = await fetch('/api/video-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = startErrorResponseSchema.safeParse(json);
        throw new VideoCallStartError(
          err.success ? err.data.reason : 'provider_unavailable',
          err.success ? (err.data.resetsAt ?? null) : null,
        );
      }
      return startResponseSchema.parse(json);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.videoCallAllowance() }),
  });
}

export function useEndVideoCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/video-call/${encodeURIComponent(id)}/end`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to end video call (${res.status})`);
      return statusResponseSchema.parse(await res.json());
    },
    onSuccess: (status, id) => queryClient.setQueryData(dataKeys.videoCall(id), status),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.videoCallAllowance() }),
  });
}

export async function fetchVideoCallStatus(id: string): Promise<VideoCallStatusResponse> {
  const res = await fetch(`/api/video-call/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load video call (${res.status})`);
  return statusResponseSchema.parse(await res.json());
}
```

- [ ] **Step 4: Expose what the call needs from `useChatWidget`**

In `src/components/chat-widget/use-chat-widget.ts`:
- Take `setMessages` from `useChat`: `const { messages, status, sendMessage, setMessages } = useChat({ … });`
- Return, in addition to the existing fields:
```ts
    setMessages,
    courseSlug,
    /** Read at call time (event handlers), never during render. */
    getChatId: () => chatIdRef.current,
    /** A video call may create the chat row; later text turns must continue it. */
    adoptChatId: (id: string) => {
      chatIdRef.current = id;
    },
```

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/atoms/video-call.ts src/data-hooks/keys.ts src/data-hooks/use-chat-messages.ts src/data-hooks/use-video-call.ts src/components/chat-widget/use-chat-widget.ts
git commit -m "feat(video-call): client atoms, query hooks and chat-widget hooks"
```

---

### Task 13: Presentational video components and window/header slots

**Files:**
- Create: `src/components/video-call/video-call-controls.tsx`, `video-call-stage.tsx`, `video-call-window.tsx`, `on-call-bar.tsx`, `call-time-warning.tsx`, `transcript-status-line.tsx`
- Modify: `src/components/chat-widget/chat-widget-header.tsx`, `src/components/chat-widget/chat-window.tsx`

**Interfaces:**
- Consumes: T11 geometry options, T12 `videoWindowRectAtom`, `VideoCallPhase`.
- Produces: `HeaderVideoCallProps = { label: string; disabled: boolean; onClick: () => void }`; `ChatWidgetHeader` prop `videoCall?: HeaderVideoCallProps`; `ChatWindow` props `videoCall?: HeaderVideoCallProps`, `stage?: ReactNode` (replaces messages, confirm and input), `topBar?: ReactNode`; components `VideoCallControls`, `VideoCallStage`, `VideoCallWindow`, `OnCallBar`, `CallTimeWarning`, `TranscriptStatusLine` with the props below.

Presentational only: no data, no atoms (except `VideoCallWindow`, which follows `ChatWindow`'s precedent of owning its geometry hook). Verified visually in Task 15.

- [ ] **Step 1: Header button**

In `chat-widget-header.tsx`:
- Export the prop type and add a disabled state to `HeaderControlButton`:
```ts
export interface HeaderVideoCallProps {
  /** Tooltip AND accessible name; when disabled it states why and what unlocks it. */
  label: string;
  disabled: boolean;
  onClick: () => void;
}
```
- Add `disabled?: boolean` to `HeaderControlButtonProps`, pass `disabled={disabled}` and `focusableWhenDisabled` to the Base UI `Button` (keeps it focusable and hoverable so the tooltip can explain the lock), and append to its className: `'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent data-[disabled]:hover:text-secondary'`.
- Add `videoCall?: HeaderVideoCallProps` to `ChatWidgetHeaderProps`, import `Video` from `lucide-react`, and render it immediately before the font-size button:
```tsx
      {videoCall && (
        <HeaderControlButton
          label={videoCall.label}
          onClick={videoCall.onClick}
          disabled={videoCall.disabled}
        >
          <Video className="size-4" aria-hidden />
        </HeaderControlButton>
      )}
```
(Match the icon class the neighbouring buttons use if it isn't `size-4`.)

- [ ] **Step 2: Controls**

`src/components/video-call/video-call-controls.tsx`:
```tsx
import { Button } from '@base-ui/react/button';
import { Tooltip } from '@base-ui/react/tooltip';
import { Mic, MicOff, Minimize2, PhoneOff, PictureInPicture2, Video, VideoOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

interface CallControlButtonProps {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Icon toggle for the call bar — Base UI Button + Tooltip, as in the chat
 * header, but a 40 px target since these are used mid-conversation. */
const CallControlButton = ({ label, pressed, disabled, onClick, children }: CallControlButtonProps) => (
  <Tooltip.Root disableHoverablePopup>
    <Tooltip.Trigger
      render={
        <Button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-primary transition-colors',
            'bg-gray-4 hover:bg-gray-5 aria-pressed:bg-gray-12 aria-pressed:text-gray-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      }
    >
      {children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={6} className="z-50">
        <Tooltip.Popup className="rounded-md bg-inverted px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
          {label}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export interface VideoCallControlsProps {
  countdown: ReactNode;
  isMuted: boolean;
  isCameraOn: boolean;
  canPopOut: boolean;
  isDocked: boolean;
  disabled: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onTogglePopOut: () => void;
  onEnd: () => void;
}

export function VideoCallControls(props: VideoCallControlsProps) {
  return (
    <div className="flex items-center gap-2 border-gray-6 border-t px-3 py-2">
      <CallControlButton label="Mute microphone" pressed={props.isMuted} disabled={props.disabled} onClick={props.onToggleMute}>
        {props.isMuted ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
      </CallControlButton>
      <CallControlButton label="Share camera" pressed={props.isCameraOn} disabled={props.disabled} onClick={props.onToggleCamera}>
        {props.isCameraOn ? <Video className="size-5" aria-hidden /> : <VideoOff className="size-5" aria-hidden />}
      </CallControlButton>
      <span className="ms-auto font-medium text-primary text-sm tabular-nums">{props.countdown}</span>
      {props.canPopOut && (
        <CallControlButton
          label={props.isDocked ? 'Pop out video' : 'Bring video back into the chat'}
          onClick={props.onTogglePopOut}
        >
          {props.isDocked ? <PictureInPicture2 className="size-5" aria-hidden /> : <Minimize2 className="size-5" aria-hidden />}
        </CallControlButton>
      )}
      <Button
        onClick={props.onEnd}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full bg-error-9 px-4 font-medium text-black text-sm',
          'transition-colors hover:bg-error-10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2',
        )}
      >
        <PhoneOff className="size-4" aria-hidden />
        End call
      </Button>
    </div>
  );
}
```
(`text-black` on `bg-error-9`: white fails AA on red-9 — see the "red-9 button contrast" decision.)

- [ ] **Step 3: Warning, transcript line, on-call bar**

`src/components/video-call/call-time-warning.tsx`:
```tsx
/** Always-mounted live region; its content appears once at one minute left,
 * so screen readers announce it once (the countdown itself is not live). */
export function CallTimeWarning({ visible }: { visible: boolean }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
      {visible && (
        <p className="rounded-md border border-warning-7 bg-warning-3 px-3 py-1.5 font-medium text-sm text-warning-text shadow-sm">
          1 minute left
        </p>
      )}
    </div>
  );
}
```

`src/components/video-call/transcript-status-line.tsx`:
```tsx
const COPY = {
  saving: 'Saving the call transcript…',
  delayed: 'The transcript will appear in this chat shortly.',
} as const;

export function TranscriptStatusLine({ state }: { state: keyof typeof COPY }) {
  return (
    <p role="status" className="px-1 text-xs text-secondary italic">
      {COPY[state]}
    </p>
  );
}
```

`src/components/video-call/on-call-bar.tsx`:
```tsx
import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

export function OnCallBar({ countdown, onBringBack }: { countdown: ReactNode; onBringBack: () => void }) {
  return (
    <div className="flex items-center gap-2 border-gray-6 border-b bg-gray-3 px-3 py-2 text-sm">
      <span className="size-2 shrink-0 rounded-full bg-error-9" aria-hidden />
      <span className="text-primary">
        On a call · <span className="tabular-nums">{countdown}</span>
      </span>
      <Button
        onClick={onBringBack}
        className={cn(
          'ms-auto rounded-md px-2 py-1 font-medium text-accent-text transition-colors hover:bg-gray-4',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
        )}
      >
        Bring video back
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Stage**

`src/components/video-call/video-call-stage.tsx`:
```tsx
import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';
import type { VideoCallPhase } from '#/atoms/video-call';
import { cn } from '#/lib/cn';
import { VideoCallControls, type VideoCallControlsProps } from './video-call-controls';

const PHASE_COPY: Partial<Record<VideoCallPhase, string>> = {
  'requesting-media': 'Waiting for microphone permission…',
  connecting: 'Connecting to Viper…',
  reconnecting: 'Reconnecting…',
  ending: 'Ending call…',
};

/** Sets a MediaStream on a <video> through a ref callback (DOM manipulation,
 * allowed in presentational components); idempotent across re-renders. */
const attachStream = (stream: MediaStream | null) => (el: HTMLVideoElement | null) => {
  if (el && el.srcObject !== stream) el.srcObject = stream;
};

export interface VideoCallStageProps extends Omit<VideoCallControlsProps, 'disabled'> {
  phase: VideoCallPhase;
  errorMessage: string | null;
  canRetry: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  warning: ReactNode;
  onRetry: () => void;
  onDismiss: () => void;
}

export function VideoCallStage(props: VideoCallStageProps) {
  if (props.errorMessage) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-primary text-sm">{props.errorMessage}</p>
        <div className="flex gap-2">
          {props.canRetry && (
            <Button
              onClick={props.onRetry}
              className="rounded-lg bg-accent-9 px-4 py-2 font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2"
            >
              Try again
            </Button>
          )}
          <Button
            onClick={props.onDismiss}
            className="rounded-lg border border-gray-7 px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
          >
            Back to chat
          </Button>
        </div>
      </div>
    );
  }

  const status = PHASE_COPY[props.phase];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 bg-gray-1">
        {/* Viper's audio plays from this element too, so it is never muted. */}
        <video
          ref={attachStream(props.remoteStream)}
          autoPlay
          playsInline
          aria-label="Viper7"
          className="size-full object-contain"
        />
        {status && (
          <p role="status" className="absolute inset-0 flex items-center justify-center bg-gray-1/80 text-secondary text-sm">
            {status}
          </p>
        )}
        {props.localStream && props.isCameraOn && (
          <video
            ref={attachStream(props.localStream)}
            autoPlay
            playsInline
            muted
            aria-label="Your camera"
            // Mirrored like a mirror — a visual-axis transform, not a direction.
            className="absolute end-3 bottom-3 w-28 -scale-x-100 rounded-lg border border-gray-6 shadow-md"
          />
        )}
        {props.warning}
      </div>
      <VideoCallControls
        countdown={props.countdown}
        isMuted={props.isMuted}
        isCameraOn={props.isCameraOn}
        canPopOut={props.canPopOut}
        isDocked={props.isDocked}
        disabled={props.phase !== 'live'}
        onToggleMute={props.onToggleMute}
        onToggleCamera={props.onToggleCamera}
        onTogglePopOut={props.onTogglePopOut}
        onEnd={props.onEnd}
      />
    </div>
  );
}
```
(Note: `bottom-3` → use `bottom-3` only if the codebase has no logical block-end utility; Tailwind v4 has no `block-end` inset shorthand, so `bottom-3` is the documented exception for a viewport-like overlay corner — add `/* physical: overlay corner of the video frame */` beside it.)

- [ ] **Step 5: Floating window**

`src/components/video-call/video-call-window.tsx`:
```tsx
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { videoWindowRectAtom } from '#/atoms/video-call';
import { ChatWidgetResizeHandles } from '#/components/chat-widget/chat-widget-resize-handles';
import {
  computeDefaultVideoRect,
  useChatWindowGeometry,
} from '#/components/chat-widget/use-chat-window-geometry';
import { cn } from '#/lib/cn';

/**
 * The popped-out video window. Custom for the same reason as ChatWindow (no
 * Base UI primitive for a draggable/resizable OS-style window); it reuses
 * ChatWindow's geometry hook with its own persisted rect and default spot.
 * Its only exit is the stage's "End call" / "Bring video back" controls.
 */
export function VideoCallWindow({ children }: { children: ReactNode }) {
  const { left, top, width, height, dragBindings, getResizeHandleProps } = useChatWindowGeometry({
    rectAtom: videoWindowRectAtom,
    computeDefault: computeDefaultVideoRect,
  });

  return (
    <motion.div
      role="dialog"
      aria-label="Video call with Viper7"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      style={{ left, top, width, height }}
      className={cn(
        'pointer-events-auto fixed flex flex-col overflow-hidden',
        'rounded-2xl border border-gray-6 bg-gray-2 shadow-2xl',
      )}
    >
      <ChatWidgetResizeHandles getHandleProps={getResizeHandleProps} />
      <div
        {...dragBindings}
        className="flex cursor-grab touch-none select-none items-center border-gray-6 border-b px-3 py-2 active:cursor-grabbing"
      >
        <span className="font-medium text-primary text-sm">Video call · Viper7</span>
      </div>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 6: ChatWindow slots**

In `chat-window.tsx`:
- Import `HeaderVideoCallProps` from the header.
- Add to `ChatWindowProps`:
```ts
  /** Viper7 only: the header's video-call button. */
  videoCall?: HeaderVideoCallProps;
  /** Viper7 only: a docked video call. Replaces the messages, the confirm
   * affordance and the input while present. */
  stage?: ReactNode;
  /** Viper7 only: rendered above the messages (the "On a call" bar). */
  topBar?: ReactNode;
```
- Pass `videoCall={videoCall}` to `ChatWidgetHeader`.
- Replace the body after the header with:
```tsx
      {stage ?? (
        <>
          {topBar}
          <ChatWidgetMessages messages={messages} isLoading={isLoading} trailing={afterMessages} />
          {/* existing confirm block, unchanged */}
          <ChatWidgetInput onSend={(text) => sendMessage({ text })} isLoading={isLoading} />
        </>
      )}
```

- [ ] **Step 7: Type-check and lint**

Run: `pnpm tsc --noEmit -p . && pnpm biome check src/components/video-call src/components/chat-widget`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/video-call src/components/chat-widget/chat-widget-header.tsx src/components/chat-widget/chat-window.tsx
git commit -m "feat(video-call): presentational call UI and chat window slots"
```

---

### Task 14: The call controller (Daily) and wiring

**Files:**
- Create: `src/components/video-call/call-countdown-container.tsx`, `src/components/video-call/use-video-call-controller.tsx`
- Modify: `src/components/chat-widget/chat-widget.tsx`

**Interfaces:**
- Consumes: everything from Tasks 12–13; `Daily` from `@daily-co/daily-js`.
- Produces: `useVideoCallController(input: { enabled: boolean; chatOpen: boolean; courseSlug: string | undefined; getChatId: () => string | undefined; adoptChatId: (id: string) => void; replaceMessages: (messages: UIMessage[]) => void }): { headerButton: HeaderVideoCallProps | undefined; stage: ReactNode | undefined; topBar: ReactNode | undefined; floatingWindow: ReactNode; afterMessages: ReactNode | undefined; closeChat: (onClose: () => void) => void }`.

Per docs/use-effect-rules.md everything here runs from event handlers (button clicks and Daily callbacks registered in `start`); the only subscription is jotai's `onMount` clock.

- [ ] **Step 1: Countdown containers**

`src/components/video-call/call-countdown-container.tsx`:
```tsx
import { useAtomValue } from 'jotai';
import { nowAtom } from '#/atoms/video-call';
import { WARNING_AT_SECONDS } from '#/lib/video-call-contract';
import { formatCountdown, secondsUntil } from '#/lib/video-call-copy';
import { CallTimeWarning } from './call-time-warning';

/** The only readers of the ticking clock, so only these re-render each second. */
export function CallCountdownContainer({ endsAt }: { endsAt: string }) {
  const now = useAtomValue(nowAtom);
  return (
    <>
      <span className="sr-only">Time left </span>
      {formatCountdown(secondsUntil(endsAt, now))}
    </>
  );
}

export function CallTimeWarningContainer({ endsAt }: { endsAt: string }) {
  const now = useAtomValue(nowAtom);
  const left = secondsUntil(endsAt, now);
  return <CallTimeWarning visible={left > 0 && left <= WARNING_AT_SECONDS} />;
}
```

- [ ] **Step 2: The controller hook**

`src/components/video-call/use-video-call-controller.tsx`:
```tsx
import Daily, { type DailyCall, type DailyEventObjectTrack } from '@daily-co/daily-js';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useAtom, useAtomValue } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import {
  IDLE_VIDEO_CALL,
  videoCallAtom,
  videoCameraOnAtom,
  videoDockedAtom,
  videoLocalStreamAtom,
  videoMicMutedAtom,
  videoRemoteStreamAtom,
  videoTranscriptAtom,
  wideViewportAtom,
} from '#/atoms/video-call';
import type { HeaderVideoCallProps } from '#/components/chat-widget/chat-widget-header';
import { type ChatMessage, fetchChatWithMessages } from '#/data-hooks/use-chat-messages';
import { dataKeys } from '#/data-hooks/keys';
import {
  fetchVideoCallStatus,
  useEndVideoCall,
  useStartVideoCall,
  useVideoCallAllowance,
  VideoCallStartError,
} from '#/data-hooks/use-video-call';
import { callErrorMessage, videoButtonLabel } from '#/lib/video-call-copy';
import { CallCountdownContainer, CallTimeWarningContainer } from './call-countdown-container';
import { OnCallBar } from './on-call-bar';
import { TranscriptStatusLine } from './transcript-status-line';
import { VideoCallStage } from './video-call-stage';
import { VideoCallWindow } from './video-call-window';

const TRANSCRIPT_POLL_MS = 3000;
const TRANSCRIPT_POLL_ATTEMPTS = 20;
const ACTIVE_PHASES = new Set(['requesting-media', 'connecting', 'live', 'reconnecting', 'ending']);
const RETRYABLE = new Set(['mic_denied', 'provider_unavailable', 'connection_failed']);

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const toUIMessage = (m: ChatMessage): UIMessage => ({
  id: m.id,
  role: m.role as UIMessage['role'],
  parts: m.parts as UIMessage['parts'],
});

/**
 * Container logic for the Tavus video call, used by the always-mounted
 * Viper7Chat so a call survives the chat window closing (when popped out)
 * and route changes. Holds the Daily call object in a ref (an external,
 * non-serialisable resource); all UI state is in jotai atoms.
 */
export function useVideoCallController(input: {
  enabled: boolean;
  chatOpen: boolean;
  courseSlug: string | undefined;
  getChatId: () => string | undefined;
  adoptChatId: (id: string) => void;
  replaceMessages: (messages: UIMessage[]) => void;
}) {
  const [call, setCall] = useAtom(videoCallAtom);
  const [docked, setDocked] = useAtom(videoDockedAtom);
  const [muted, setMuted] = useAtom(videoMicMutedAtom);
  const [cameraOn, setCameraOn] = useAtom(videoCameraOnAtom);
  const [remoteStream, setRemoteStream] = useAtom(videoRemoteStreamAtom);
  const [localStream, setLocalStream] = useAtom(videoLocalStreamAtom);
  const [transcript, setTranscript] = useAtom(videoTranscriptAtom);
  const wide = useAtomValue(wideViewportAtom);
  const queryClient = useQueryClient();
  const startMutation = useStartVideoCall();
  const endMutation = useEndVideoCall();
  const dailyRef = useRef<DailyCall | null>(null);

  const isActive = ACTIVE_PHASES.has(call.phase);
  const allowance = useVideoCallAllowance(input.enabled && input.chatOpen && !isActive);

  function onTrack(event: DailyEventObjectTrack | undefined, started: boolean) {
    const track = event?.track;
    if (!track) return;
    const isLocal = event.participant?.local ?? false;
    if (isLocal && track.kind === 'audio') return; // never play our own mic back
    const next = (prev: MediaStream | null) => {
      const others = (prev?.getTracks() ?? []).filter((t) => t.kind !== track.kind);
      const tracks = started ? [...others, track] : others;
      return tracks.length > 0 ? new MediaStream(tracks) : null;
    };
    if (isLocal) setLocalStream(next);
    else setRemoteStream(next);
  }

  async function loadTranscript(callId: string, chatId: string) {
    setTranscript('saving');
    for (let attempt = 0; attempt < TRANSCRIPT_POLL_ATTEMPTS; attempt++) {
      await delay(TRANSCRIPT_POLL_MS);
      try {
        const status = await queryClient.fetchQuery({
          queryKey: dataKeys.videoCall(callId),
          queryFn: () => fetchVideoCallStatus(callId),
          staleTime: 0,
        });
        if (!status.transcriptSaved) continue;
        // The widget's useChat state is the only client copy (no server
        // rehydration), so load the persisted chat — text turns, the call's
        // transcript and its status lines — and replace it wholesale.
        const chat = await queryClient.fetchQuery({
          queryKey: dataKeys.chatMessages(chatId),
          queryFn: () => fetchChatWithMessages(chatId),
          staleTime: 0,
        });
        input.replaceMessages(chat.messages.map(toUIMessage));
        setTranscript('saved');
        return;
      } catch {
        // Transient — try again on the next tick.
      }
    }
    setTranscript('delayed');
  }

  async function finish(callId: string, chatId: string, error?: 'connection_failed') {
    const daily = dailyRef.current;
    if (!daily) return; // `leave()` fires left-meeting, which lands here again
    dailyRef.current = null;
    setCall((c) => ({ ...c, phase: 'ending' }));
    try {
      await daily.leave();
    } catch {
      // Already gone.
    }
    try {
      await daily.destroy();
    } catch {
      // Already destroyed.
    }
    setRemoteStream(null);
    setLocalStream(null);
    setMuted(false);
    setCameraOn(false);
    setCall({ ...IDLE_VIDEO_CALL, phase: error ? 'error' : 'ended', callId, chatId, error: error ?? null });
    endMutation.mutate(callId);
    void loadTranscript(callId, chatId);
  }

  async function start() {
    if (isActive) return;
    setDocked(true);
    setTranscript('idle');
    setCall({ ...IDLE_VIDEO_CALL, phase: 'requesting-media' });

    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of probe.getTracks()) track.stop();
    } catch {
      setCall({ ...IDLE_VIDEO_CALL, phase: 'error', error: 'mic_denied' });
      return;
    }

    setCall({ ...IDLE_VIDEO_CALL, phase: 'connecting' });
    let started: Awaited<ReturnType<typeof startMutation.mutateAsync>>;
    try {
      started = await startMutation.mutateAsync({
        chatId: input.getChatId(),
        courseSlug: input.courseSlug,
      });
    } catch (err) {
      const startError = err instanceof VideoCallStartError ? err : null;
      setCall({
        ...IDLE_VIDEO_CALL,
        phase: 'error',
        error: startError?.reason ?? 'provider_unavailable',
        resetsAt: startError?.resetsAt ?? null,
      });
      return;
    }

    input.adoptChatId(started.chatId);
    const daily = Daily.createCallObject({ subscribeToTracksAutomatically: true });
    dailyRef.current = daily;
    const end = (error?: 'connection_failed') => void finish(started.id, started.chatId, error);
    daily
      .on('track-started', (e) => onTrack(e, true))
      .on('track-stopped', (e) => onTrack(e, false))
      .on('participant-left', (e) => {
        // The replica leaving means Tavus ended the call (time limit).
        if (e && !e.participant.local) end();
      })
      .on('left-meeting', () => end())
      .on('network-connection', (e) => {
        if (!e) return;
        setCall((c) =>
          c.callId === started.id && (c.phase === 'live' || c.phase === 'reconnecting')
            ? { ...c, phase: e.event === 'interrupted' ? 'reconnecting' : 'live' }
            : c,
        );
      })
      .on('camera-error', () => setCameraOn(false))
      .on('error', () => end('connection_failed'));

    try {
      await daily.join({ url: started.conversationUrl, startVideoOff: true, startAudioOff: false });
    } catch {
      end('connection_failed');
      return;
    }
    setCall({
      phase: 'live',
      callId: started.id,
      chatId: started.chatId,
      endsAt: started.endsAt,
      error: null,
      resetsAt: null,
    });
  }

  function hangUp() {
    if (call.callId && call.chatId) void finish(call.callId, call.chatId);
  }

  function toggleMute() {
    dailyRef.current?.setLocalAudio(muted);
    setMuted(!muted);
  }

  function toggleCamera() {
    dailyRef.current?.setLocalVideo(!cameraOn);
    setCameraOn(!cameraOn);
  }

  // Where the stage goes: in the chat window when docked and the window is
  // showing; otherwise in the floating window (which is also the fallback if
  // the chat window is hidden mid-call, e.g. navigating to /admin).
  const showDocked = (isActive || call.phase === 'error') && docked && input.chatOpen;
  const showFloating = isActive && (!docked || !input.chatOpen);

  const errorMessage =
    call.phase === 'error' && call.error ? callErrorMessage(call.error, call.resetsAt) : null;

  const stageNode = (
    <VideoCallStage
      phase={call.phase}
      errorMessage={errorMessage}
      canRetry={call.error !== null && RETRYABLE.has(call.error)}
      remoteStream={remoteStream}
      localStream={localStream}
      countdown={call.endsAt ? <CallCountdownContainer endsAt={call.endsAt} /> : '--:--'}
      warning={call.endsAt ? <CallTimeWarningContainer endsAt={call.endsAt} /> : null}
      isMuted={muted}
      isCameraOn={cameraOn}
      canPopOut={wide}
      isDocked={docked}
      onToggleMute={toggleMute}
      onToggleCamera={toggleCamera}
      onTogglePopOut={() => setDocked(!docked)}
      onEnd={hangUp}
      onRetry={() => void start()}
      onDismiss={() => setCall(IDLE_VIDEO_CALL)}
    />
  );

  const headerButton: HeaderVideoCallProps | undefined = input.enabled
    ? isActive
      ? { label: videoButtonLabel({ status: 'in-call' }), disabled: true, onClick: () => {} }
      : !allowance.data
        ? { label: videoButtonLabel({ status: 'loading' }), disabled: true, onClick: () => {} }
        : allowance.data.reason
          ? {
              label: videoButtonLabel({
                status: 'unavailable',
                reason: allowance.data.reason,
                resetsAt: allowance.data.resetsAt,
              }),
              disabled: true,
              onClick: () => {},
            }
          : { label: videoButtonLabel({ status: 'available' }), disabled: false, onClick: () => void start() }
    : undefined;

  const floatingWindow: ReactNode = (
    <AnimatePresence>
      {showFloating && <VideoCallWindow key="video-window">{stageNode}</VideoCallWindow>}
    </AnimatePresence>
  );

  return {
    headerButton,
    stage: showDocked ? stageNode : undefined,
    topBar:
      isActive && !showDocked && call.endsAt ? (
        <OnCallBar
          countdown={<CallCountdownContainer endsAt={call.endsAt} />}
          onBringBack={() => setDocked(true)}
        />
      ) : undefined,
    floatingWindow,
    afterMessages:
      transcript === 'saving' || transcript === 'delayed' ? (
        <TranscriptStatusLine state={transcript} />
      ) : undefined,
    /** Closing the chat window ends a docked call; a popped-out call keeps going. */
    closeChat: (onClose: () => void) => {
      if (isActive && docked) hangUp();
      onClose();
    },
  };
}
```
Check the Daily event payload types against `node_modules/@daily-co/daily-js/index.d.ts` (`DailyEventObjectTrack`, `DailyEventObjectParticipantLeft`, `DailyEventObjectNetworkConnectionEvent`) and adjust property names if `tsc` disagrees.

- [ ] **Step 3: Wire it into Viper7Chat**

In `src/components/chat-widget/chat-widget.tsx`:
- `Viper7Chat` gets a new prop `videoEnabled: boolean` and becomes:
```tsx
function Viper7Chat({ isOpen, videoEnabled, fontSize, onToggleFontSize, onClose }: ChatWindowChromeProps & { videoEnabled: boolean }) {
  const { messages, sendMessage, isLoading, setMessages, getChatId, adoptChatId, courseSlug } = useChatWidget();
  const video = useVideoCallController({
    enabled: videoEnabled,
    chatOpen: isOpen,
    courseSlug,
    getChatId,
    adoptChatId,
    replaceMessages: setMessages,
  });

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <ChatWindow
            fontSize={fontSize}
            onToggleFontSize={onToggleFontSize}
            onClose={() => video.closeChat(onClose)}
            messages={messages}
            sendMessage={sendMessage}
            isLoading={isLoading}
            videoCall={video.headerButton}
            stage={video.stage}
            topBar={video.topBar}
            afterMessages={video.afterMessages}
          />
        )}
      </AnimatePresence>
      {video.floatingWindow}
    </>
  );
}
```
- In `ChatWidget`, pass `videoEnabled={!hidden && mode.kind === 'viper7'}`.
- Extend `Viper7Chat`'s doc comment with one sentence: the always-mounted guarantee is also what keeps a popped-out video call alive across close and route changes.

- [ ] **Step 4: Type-check, lint, full test run**

Run: `pnpm tsc --noEmit -p . && pnpm biome check src && pnpm test`
Expected: no type or lint errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-call/call-countdown-container.tsx src/components/video-call/use-video-call-controller.tsx src/components/chat-widget/chat-widget.tsx
git commit -m "feat(video-call): Daily-driven call controller wired into the Viper7 chat"
```

---

### Task 15: Build check and real-browser walkthrough

**Files:**
- Modify: `src/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Build and check what shipped to the browser**

Run: `pnpm build`
Expected: succeeds; `src/routeTree.gen.ts` now lists the five new routes.

Run: `grep -rlE "TAVUS_API_KEY|TAVUS_LLM_SECRET|tavusapi\.com|drizzle-orm" .output/public || echo "clean"`
Expected: `clean`. Any hit means a server module leaked into the client bundle — find the importer and fix before continuing.

- [ ] **Step 2: Commit the route tree**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: regenerate route tree for video call routes"
```

- [ ] **Step 3: Manual walkthrough (dev, ngrok)**

With the dev server running, ngrok pointed at its port, `TAVUS_PUBLIC_URL` set to the ngrok URL and the persona synced (Task 10), sign in as a learner and on a course page:

1. Open the chat. The video button reads "Start a video call with Viper7". Click it, allow the mic → "Connecting to Viper…" → Viper appears and greets you.
2. Ask a course question. Viper answers aloud using course material within a few seconds; the countdown ticks.
3. Toggle mute and camera; the self-view appears mirrored.
4. Pop out: the video moves to its own window beside the chat; the chat shows "On a call · mm:ss · Bring video back". Drag and resize the video window, including dragging across the video itself. Bring it back.
5. Pop out again, close the chat window: the call continues. Reopen the chat, bring it back, close the chat: the call ends.
6. After hang-up: "Saving the call transcript…" then the transcript appears between "Video call with Viper7" and "Video call ended · N min". Send a text message referencing the call; Viper knows what was said.
7. In devtools, block the mic for the site and start a call: the mic message with "Try again" / "Back to chat".
8. Start a call in two tabs: the second says you're already on a call in another tab.
9. Run `psql "$DATABASE_URL" -c "update video_calls set duration_seconds = 1790 where user_id = '<you>' and status = 'ended'"` on one row, reopen the chat: the button is disabled and its tooltip says today's 30 minutes are used and resets at 00:00 UTC. Revert the row.
10. Server log: no `user_appearance` text anywhere; `tavus completion failed` only for genuine failures, not for interrupted turns.

Record any defect, fix it under the task that owns the code, and re-run that task's tests.

- [ ] **Step 4: Production checklist (do not deploy from this plan)**

Before the branch ships: set `TAVUS_API_KEY`, `TAVUS_REPLICA_ID`, `TAVUS_LLM_SECRET` (a new value, not the dev one) and `TAVUS_PUBLIC_URL` (the production origin) in Vercel; run `pnpm db:migrate-video-calls` against production; deploy; run `pnpm tavus:sync-persona` with production env to create the production persona; set `TAVUS_PERSONA_ID` in Vercel and redeploy. Verify the deployed `/api/video-call/allowance` returns `reason: null` for a fresh user.
