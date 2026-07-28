# Onboarding Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the already-merged onboarding machine from the browser — a server-side turn runner rehydrated per request with the machine's state persisted as an XState snapshot, three API routes, and a mode on the existing chat widget.

**Architecture:** The turn runner is split in two so the load-bearing property is testable. `src/lib/onboarding-runner.ts` is **pure and injectable**: given an optional snapshot, machine input, an event, and an implementations object, it restores or creates the actor, applies the event, waits for the machine to settle at a state expecting input, and returns the new snapshot plus the turns emitted. It imports nothing from `@/db` and nothing from `ai`, so vitest can drive it with stub actors — which is how we prove `followUpCount` survives a snapshot round-trip and the follow-up cap still bounds across request boundaries. A thin `.server.ts` module and the three routes wrap it with the database I/O.

**Tech Stack:** XState 5.32.4 (`getPersistedSnapshot` / `createActor(machine, { snapshot })`), TanStack Start file routes, TanStack Query, `ai@6` `UIMessage` for the client shape, Drizzle + PostgreSQL, zod v4, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-07-28-onboarding-chat-ui-design.md`

## Global Constraints

- **`@/` never resolves under vitest.** Verified repeatedly in this repo: `@/*` is a `tsconfig.json`-only path with no matching Vite/Vitest resolve alias, so *any* `@/` import reached from a test fails at load. **Every file that must be test-importable uses `#/`.** `@/` is fine only in modules no test imports (`src/db/*`, `*.server.ts`).
- **Testable route handlers follow `src/routes/api/course/progress-summary.ts` exactly:** the route imports its collaborators via `#/`, and its test `vi.mock`s those same `#/` specifiers *before* importing the handler. The mock intercepts the `#/`-resolved path so the real `@/db`-using module underneath never loads. A `@/` import in a route breaks its own test.
- **`UIMessage` (from `ai`) requires `{ id: string; role: 'system' | 'user' | 'assistant'; parts }`** — confirmed in `node_modules/ai/dist/index.d.ts:1659`. `ChatWidgetMessages` is typed `messages: UIMessage[]`, so the onboarding client hook must produce that shape. This is what keeps every presentational component unchanged.
- **`ChatWindowProps` is already exactly what both modes need** — verified in `src/components/chat-widget/chat-window.tsx:11`: `{ fontSize: number; onToggleFontSize: () => void; onClose: () => void; messages: UIMessage[]; sendMessage: (opts: { text: string }) => void; isLoading: boolean }`. Note `sendMessage` takes an **options object**, not a bare string — the onboarding hook must expose `(opts: { text: string }) => void` to drop in without touching the window.
- **`waitFor`'s timeout defaults to `Infinity`** — confirmed in `node_modules/xstate/dist/declarations/src/waitFor.d.ts:2-12`, where `WaitForOptions` is `{ timeout: number; signal?: AbortSignal }`. Passing an explicit timeout is therefore not belt-and-braces: without it, a hung actor holds the request open forever.
- **Do not modify any presentational chat-widget component.** `chat-widget-messages.tsx`, `chat-message.tsx`, `chat-widget-input.tsx`, `typing-dots.tsx`, `chat-window.tsx` and the geometry hooks are shared with the shipped Viper7 chat. This plan changes only container-level code and adds new files.
- **Do not run `pnpm db:push`.** Applying schema changes is the user's step, at the end.
- **Do not run `pnpm dev`.** It is a long-running server that will not exit. An external dev server owned by the user may already be running on port 5001 — do not disturb it, and note it live-regenerates `src/routeTree.gen.ts`.
- **`src/routeTree.gen.ts` is git-tracked.** Any task that adds a file under `src/routes/` regenerates it and **must stage it**. Regenerate with `pnpm build` (exits 0 in ~1s), never `pnpm dev`. There is no dedicated codegen script.
- **TanStack Router types `Link`'s `to` and route paths against the generated registry** — referencing a route that does not exist yet, or deleting one still referenced, is a **compile** error, not a runtime one. Plan task boundaries accordingly.
- Single quotes (biome `quoteStyle: 'single'`) in new files; `src/db/schema.ts` uses double quotes — match the file you edit. **Never run biome with `--write` on `src/db/schema.ts`** (large pre-existing quote-style diff).
- **Never `git add -A`.** Stage explicit paths; `git status --short` before every commit. These must NOT be staged: `CLAUDE.md` (carries the user's own uncommitted edit), `docs/onboarding.md`, `src/common/config.ts`.
- **Pre-existing biome errors exist and are not yours:** 10 in `src/components/sidebar/`, 2 in `src/db/course.ts`, several in `src/components/lesson-main/` and `src/data-hooks/__tests__/`. All verified present on `main`. Run biome on your touched files specifically; do not fix the others.
- **Verified baseline (measured on this branch):** `pnpm exec tsc --noEmit` completely clean; `pnpm test` 104 files / 607 passed / 28 skipped. Any tsc output or test regression is yours.
- Vitest prints `close timed out after 10000ms / something prevents Vite server from exiting` after the summary — a pre-existing config quirk, **not** a failure. Judge from the `Test Files` / `Tests` summary lines.
- Branch: `feat/onboarding-chat-ui` (created off `main`; spec already committed).

## What already exists — do not rebuild it

All merged to `main`:

- `src/machines/onboarding-machine.ts` — the machine, 24 tests. Exports `onboardingMachine`, `OnboardingInput`, `OnboardingContext`, `OnboardingEvent`, `OnboardingMessage` (`{ role: 'assistant' | 'user'; text: string }`), `TRANSCRIPT_TURN_LIMIT`, `FOLLOW_UP_CAP`, `CONSENT_CLARIFICATION_CAP`, `HESITANCY_TURN_THRESHOLD`.
  - States expecting user input: `awaitingConsent`, `awaitingAnswer`, `confirming`.
  - Final states: `consentDeclined`, `paused`, `deleted`, `complete`, `failed`.
  - `OnboardingInput` = `{ onboardingId, questions, answers, initialMessages }`.
  - `OnboardingEvent` = `REPLY { text }` | `CONFIRM` | `PAUSE` | `DELETE`.
- `src/machines/onboarding-implementations.ts` — `createOnboardingImplementations(deps)` where `OnboardingDeps` = `{ courseName, initialMessageCount, questions }`.
- `src/db/course-onboarding.ts` — `loadOnboardingSession({ userId, courseId })` returning `{ row, messages, questions, source }`; `saveAnswer`, `appendMessage`, `completeOnboarding`, `declineConsent`, `deleteOnboarding`.
- `src/lib/course-onboarding.ts` — `hashQuestionSet`, `pendingQuestions`, `isOnboardingComplete`, `shouldOfferOnboarding`.
- `src/components/chat-widget/` — the window, launcher, geometry, and `use-chat-widget.ts` (Viper7's data layer via `@ai-sdk/react`).

Two known gaps this plan closes: `createOnboardingImplementations`'s `initialMessageCount` has no producer, and the machine's `initialMessages` is never populated even though `loadOnboardingSession` returns the messages to populate it from.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/db/schema.ts` | Modify | `machine_snapshot` + `machine_version` columns on `course_onboarding`. |
| `src/machines/onboarding-machine.ts` | Modify | Export `ONBOARDING_MACHINE_VERSION`. |
| `src/lib/onboarding-transport.ts` | Create | Pure: settled-state predicate, status derivation, message mapping. |
| `src/lib/__tests__/onboarding-transport.test.ts` | Create | Tests for the above. |
| `src/lib/onboarding-runner.ts` | Create | Pure, injectable turn runner. **No `@/db`, no `ai` imports.** |
| `src/lib/__tests__/onboarding-runner.test.ts` | Create | Snapshot round-trip; the cap surviving a request boundary. |
| `src/db/course.ts` | Modify | `getCourseIdBySlug(slug)`. |
| `src/db/course-onboarding.ts` | Modify | `saveMachineSnapshot({ onboardingId, snapshot, version })`. |
| `src/lib/onboarding-session.server.ts` | Create | Server glue: DB I/O around the pure runner. |
| `src/routes/api/course/onboarding/start.ts` | Create | `POST` — load/create, produce the greeting. |
| `src/routes/api/course/onboarding/reply.ts` | Create | `POST` — advance with a user reply. |
| `src/routes/api/course/onboarding/delete.ts` | Create | `POST` — the tombstone path. |
| `src/routes/api/course/onboarding/__tests__/*.test.ts` | Create | Three handler tests. |
| `src/data-hooks/keys.ts` | Modify | `onboardingSession(courseSlug)` key. |
| `src/data-hooks/use-onboarding-chat.ts` | Create | Client hook producing `UIMessage[]`. |
| `src/atoms/chat-widget.ts` | Modify | A `chatWidgetModeAtom`. |
| `src/components/chat-widget/chat-widget.tsx` | Modify | Select which conversation the window drives. |
| `src/components/chat-widget/chat-window.tsx` | Modify | Accept the already-resolved message/send props for either mode. |
| `src/components/courses/onboarding-prompt.tsx` | Create | The dismissible prompt (presentational). |
| `src/routes/_authed/course.$courseSlug.index.tsx` | Modify | Render the prompt when onboarding should be offered. |

---

## Task 1: Schema + machine version constant

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/machines/onboarding-machine.ts`

**Interfaces:**
- Produces: `courseOnboardingTable.machineSnapshot`, `courseOnboardingTable.machineVersion`; `ONBOARDING_MACHINE_VERSION`.

**No unit test** — a Drizzle declaration is configuration and `src/db/schema.ts` cannot be imported under vitest (it imports `@/types`). `tsc` is the verification.

- [ ] **Step 1: Add the two columns**

In `src/db/schema.ts`, inside `courseOnboardingTable`, after `deletedAt` and before `createdAt`. **Double quotes** to match the file:

```ts
    // The machine's settled state after the last turn, from
    // actor.getPersistedSnapshot(). Restored with
    // createActor(machine, { snapshot }).
    //
    // Load-bearing, not a convenience: eight of OnboardingContext's ten
    // fields are not reconstructible from other columns, so rebuilding
    // context fresh each request would reset followUpCount and
    // consentClarificationCount every turn — silently disabling both caps.
    machineSnapshot: jsonb("machine_snapshot"),

    // Guards the snapshot across deploys that change the machine's shape. On
    // mismatch the snapshot is discarded and the machine starts fresh, which
    // is safe: `answers` is durable, so pendingQuestions() resumes the user
    // at their next unanswered question. Because the failure mode is mild,
    // the guard is deliberately biased toward discarding.
    machineVersion: varchar("machine_version", { length: 32 }),
```

Both nullable — null means "no settled turn yet", the state before the greeting runs.

- [ ] **Step 2: Export the version constant**

In `src/machines/onboarding-machine.ts`, beside the other exported constants near the top:

```ts
/**
 * Bump this whenever the machine's state names or context shape change.
 * A persisted snapshot whose version differs is discarded rather than
 * restored — see machineVersion in src/db/schema.ts for why that is safe.
 *
 * The version expresses intent; onboarding-runner.ts additionally wraps
 * restoration in a try/catch, so a shape change that slips through without a
 * bump still degrades to a fresh start rather than throwing.
 */
export const ONBOARDING_MACHINE_VERSION = '1';
```

- [ ] **Step 3: Verify types**

Run: `pnpm exec tsc --noEmit` — expect zero output.

Do **not** run `pnpm exec biome check --write src/db/schema.ts`.

- [ ] **Step 4: Commit**

Confirm the schema diff contains only your two columns:

```bash
git diff src/db/schema.ts
git add src/db/schema.ts src/machines/onboarding-machine.ts
git status --short
git commit -m "feat(onboarding): add machine snapshot columns and version constant"
```

If `git diff src/db/schema.ts` shows anything else, STOP and report BLOCKED.

---

## Task 2: Pure transport helpers

**Files:**
- Create: `src/lib/onboarding-transport.ts`
- Test: `src/lib/__tests__/onboarding-transport.test.ts`

**Interfaces:**
- Consumes: `OnboardingMessage` from `#/machines/onboarding-machine`.
- Produces:
  - `type OnboardingStatus = 'awaiting_consent' | 'awaiting_answer' | 'confirming' | 'complete' | 'declined' | 'deleted' | 'paused' | 'failed'`
  - `WAITING_STATES: readonly string[]`
  - `isSettled(stateValue: string, status: 'active' | 'done' | 'error' | 'stopped'): boolean`
  - `toStatus(stateValue: string, status: ...): OnboardingStatus`
  - `messageRowsToTranscript(rows): OnboardingMessage[]`
  - `transcriptToUIMessages(turns: OnboardingMessage[]): UIMessageLike[]` where `UIMessageLike = { id: string; role: 'assistant' | 'user'; parts: [{ type: 'text'; text: string }] }`

**Why a single shared `isSettled`:** all three routes need the same definition of "the machine has stopped and is waiting for input". If each decides independently they will drift, and a route that treats a mid-flight state as settled would persist a snapshot with a running invoke.

**On `'paused'` being in the status union:** the machine has a `paused` final state reachable via a `PAUSE` event, but **no route in this plan sends one** — pausing is the absence of further requests, per the spec. The status is included for completeness of the state→status map rather than because the transport can currently produce it. That is deliberate, not dead code: omitting it would make `toStatus` return `'failed'` if a future caller ever sends `PAUSE`, turning a normal pause into a reported error.

**Why `UIMessageLike` rather than importing `UIMessage`:** this module must stay importable from a test, and importing `ai` into a pure helper drags a large dependency into the test graph for a three-field structural type. The client hook asserts compatibility at its own boundary, where `ai` is already imported.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/onboarding-transport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isSettled,
  messageRowsToTranscript,
  toStatus,
  transcriptToUIMessages,
} from '#/lib/onboarding-transport';

describe('isSettled', () => {
  it.each(['awaitingConsent', 'awaitingAnswer', 'confirming'])(
    'treats %s as settled while the actor is still active',
    (state) => {
      expect(isSettled(state, 'active')).toBe(true);
    },
  );

  it.each([
    'greeting',
    'evaluatingConsent',
    'signingOff',
    'recordingDecline',
    'asking',
    'evaluating',
    'askingFollowUp',
    'persisting',
    'summarising',
    'completing',
    'deleting',
  ])('does NOT treat mid-flight state %s as settled', (state) => {
    expect(isSettled(state, 'active')).toBe(false);
  });

  it('treats any state as settled once the actor is done', () => {
    // Final states stop the actor; the state value is whichever final state
    // it landed in, so settledness must come from the actor status, not the
    // name — otherwise a route would wait forever on a completed interview.
    expect(isSettled('complete', 'done')).toBe(true);
    expect(isSettled('consentDeclined', 'done')).toBe(true);
    expect(isSettled('deleted', 'done')).toBe(true);
  });

  it('treats an errored actor as settled so a caller cannot hang on it', () => {
    expect(isSettled('evaluating', 'error')).toBe(true);
  });
});

describe('toStatus', () => {
  it.each([
    ['awaitingConsent', 'awaiting_consent'],
    ['awaitingAnswer', 'awaiting_answer'],
    ['confirming', 'confirming'],
    ['complete', 'complete'],
    ['consentDeclined', 'declined'],
    ['deleted', 'deleted'],
    ['paused', 'paused'],
    ['failed', 'failed'],
  ])('maps %s to %s', (state, expected) => {
    expect(toStatus(state, 'active')).toBe(expected);
  });

  it('reports failed for an errored actor regardless of state name', () => {
    expect(toStatus('evaluating', 'error')).toBe('failed');
  });

  it('reports failed for an unrecognised state rather than guessing', () => {
    // A state added to the machine without updating this map must surface
    // loudly, not be silently reported as a working status.
    expect(toStatus('someNewState', 'active')).toBe('failed');
  });
});

describe('messageRowsToTranscript', () => {
  it('extracts text from the parts shape appendMessage writes', () => {
    const rows = [
      { role: 'assistant', parts: [{ type: 'text', text: 'Hello' }], order: 0 },
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }], order: 1 },
    ];
    expect(messageRowsToTranscript(rows)).toEqual([
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Hi' },
    ]);
  });

  it('orders by `order`, not by array position', () => {
    const rows = [
      { role: 'user', parts: [{ type: 'text', text: 'second' }], order: 1 },
      { role: 'assistant', parts: [{ type: 'text', text: 'first' }], order: 0 },
    ];
    expect(messageRowsToTranscript(rows).map((m) => m.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('joins multiple text parts in one row', () => {
    const rows = [
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
        order: 0,
      },
    ];
    expect(messageRowsToTranscript(rows)[0].text).toBe('ab');
  });

  it('skips non-text parts rather than throwing', () => {
    const rows = [
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'kept' },
          { type: 'data-something', payload: 1 },
        ],
        order: 0,
      },
    ];
    expect(messageRowsToTranscript(rows)[0].text).toBe('kept');
  });

  it('tolerates a row whose parts are not an array', () => {
    // parts is untyped jsonb, so a malformed row must not crash a whole
    // session load.
    const rows = [{ role: 'assistant', parts: null, order: 0 }];
    expect(messageRowsToTranscript(rows)).toEqual([
      { role: 'assistant', text: '' },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(messageRowsToTranscript([])).toEqual([]);
  });
});

describe('transcriptToUIMessages', () => {
  it('produces stable unique ids and the text part shape', () => {
    const result = transcriptToUIMessages([
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Hi' },
    ]);
    expect(result).toEqual([
      { id: 'onboarding-0', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'onboarding-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ]);
  });

  it('gives every message a distinct id even when texts repeat', () => {
    const result = transcriptToUIMessages([
      { role: 'user', text: 'same' },
      { role: 'user', text: 'same' },
    ]);
    expect(new Set(result.map((m) => m.id)).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/__tests__/onboarding-transport.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/onboarding-transport.ts`:

```ts
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
export const isSettled = (
  stateValue: string,
  status: ActorStatus,
): boolean =>
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
```

- [ ] **Step 4: Run to verify passing**

Run: `pnpm vitest run src/lib/__tests__/onboarding-transport.test.ts`

Expected: PASS. Count the tests and record the number in your report.

- [ ] **Step 5: Types and formatting**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/lib/onboarding-transport.ts src/lib/__tests__/onboarding-transport.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding-transport.ts src/lib/__tests__/onboarding-transport.test.ts
git status --short
git commit -m "feat(onboarding): add pure transport helpers for the machine"
```

---

## Task 3: The pure turn runner

**Files:**
- Create: `src/lib/onboarding-runner.ts`
- Test: `src/lib/__tests__/onboarding-runner.test.ts`

**Interfaces:**
- Consumes: `onboardingMachine`, `ONBOARDING_MACHINE_VERSION`, `OnboardingInput`, `OnboardingEvent`, `OnboardingMessage` from `#/machines/onboarding-machine`; `isSettled`, `toStatus`, `OnboardingStatus` from `#/lib/onboarding-transport`; `createActor`, `waitFor` from `xstate`.
- Produces:
  ```ts
  export type RunTurnArgs = {
    snapshot: unknown | null;
    snapshotVersion: string | null;
    input: OnboardingInput;
    implementations: Parameters<typeof onboardingMachine.provide>[0];
    event: OnboardingEvent | null;
    timeoutMs?: number;
  };
  export type RunTurnResult = {
    snapshot: unknown;
    status: OnboardingStatus;
    transcript: OnboardingMessage[];
    newTurns: OnboardingMessage[];
    restoredFromSnapshot: boolean;
  };
  export const runOnboardingTurn: (args: RunTurnArgs) => Promise<RunTurnResult>;
  ```

**This is the task that matters most, and its test is the reason the runner is pure.** It imports nothing from `@/db` and nothing from `ai`, so vitest can drive it with stub actors — which is how we prove the machine's safety properties survive being torn down and rebuilt between requests. A runner that reached for the database could only be reasoned about, not tested.

**Behaviour:**
- `event: null` means "start" — create or restore, run to settled, emit whatever turns resulted (the greeting on a fresh session).
- Restore when `snapshot` is non-null **and** `snapshotVersion === ONBOARDING_MACHINE_VERSION`. Wrap `createActor(machine, { snapshot })` in try/catch; on any throw, fall back to a fresh actor. The version is the intent; the try/catch is the net for a shape change shipped without a bump.
- `newTurns` is the tail of `transcript` beyond `input.initialMessages.length` — the turns this call produced. That is what the route returns to the client.
- Time-box `waitFor` (default 30s) so a hung actor surfaces as a rejection rather than an open request.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/onboarding-runner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fromPromise } from 'xstate';
import { DEFAULT_ONBOARDING_QUESTIONS } from '#/lib/onboarding-default-questions';
import { runOnboardingTurn } from '#/lib/onboarding-runner';
import {
  FOLLOW_UP_CAP,
  ONBOARDING_MACHINE_VERSION,
  type OnboardingInput,
} from '#/machines/onboarding-machine';
import type { OnboardingQuestions } from '#/types';

const ONE: OnboardingQuestions = [{ id: 'q1', text: 'Only question?' }];

const baseInput = (
  overrides: Partial<OnboardingInput> = {},
): OnboardingInput => ({
  onboardingId: 1,
  questions: ONE,
  answers: {},
  initialMessages: [],
  ...overrides,
});

/**
 * Stub implementations. `replyVerdicts` is consumed one per evaluateReply
 * call so a test can script a follow-up loop across simulated requests.
 */
function stubs({
  replyVerdicts = [],
  saveAnswer = vi.fn(async () => {}),
}: {
  replyVerdicts?: {
    status: string;
    answer: string | null;
    followUp: string | null;
    hesitancy: boolean;
  }[];
  saveAnswer?: () => Promise<void>;
} = {}) {
  const queue = [...replyVerdicts];
  return {
    actors: {
      greet: fromPromise(async () => 'Welcome — may I ask a few questions?'),
      evaluateConsent: fromPromise(async () => ({
        status: 'consented' as const,
        reply: null,
      })),
      signOff: fromPromise(async () => 'No problem at all.'),
      declineConsent: fromPromise(async () => {}),
      askQuestion: fromPromise(async () => 'So, tell me about you?'),
      evaluateReply: fromPromise(async () => {
        const next = queue.shift();
        if (!next) throw new Error('evaluateReply called more than scripted');
        return next;
      }),
      saveAnswer: fromPromise(saveAnswer),
      summarise: fromPromise(async () => "Here's what I heard…"),
      completeOnboarding: fromPromise(async () => {}),
      deleteOnboarding: fromPromise(async () => {}),
    },
  };
}

const vague = {
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
    const TWO: OnboardingQuestions = [
      { id: 'q1', text: 'First?' },
      { id: 'q2', text: 'Second?' },
    ];
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
          evaluateConsent: fromPromise(async () => ({
            status: 'declined' as const,
            reply: null,
          })),
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/__tests__/onboarding-runner.test.ts`

Expected: FAIL — `#/lib/onboarding-runner` does not exist.

- [ ] **Step 3: Write the runner**

Create `src/lib/onboarding-runner.ts`. It must import **nothing** from `@/db` and nothing from `ai`.

```ts
import { createActor, waitFor } from 'xstate';
import {
  isSettled,
  type OnboardingStatus,
  toStatus,
} from '#/lib/onboarding-transport';
import {
  ONBOARDING_MACHINE_VERSION,
  onboardingMachine,
  type OnboardingEvent,
  type OnboardingInput,
  type OnboardingMessage,
} from '#/machines/onboarding-machine';

const DEFAULT_TIMEOUT_MS = 30_000;

export type RunTurnArgs = {
  /** The persisted snapshot from course_onboarding.machine_snapshot, or null. */
  snapshot: unknown | null;
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

  let actor: ReturnType<typeof createActor<typeof machine>> | null = null;
  let restoredFromSnapshot = false;

  if (versionMatches) {
    try {
      actor = createActor(machine, {
        snapshot: snapshot as Parameters<
          typeof createActor<typeof machine>
        >[1] extends { snapshot?: infer S }
          ? S
          : never,
        input,
      });
      restoredFromSnapshot = true;
    } catch {
      // A shape change shipped without a version bump lands here. Degrade to
      // a fresh machine rather than failing the request — `answers` is
      // durable, so pendingQuestions() still resumes the user correctly.
      actor = null;
      restoredFromSnapshot = false;
    }
  }

  if (!actor) {
    actor = createActor(machine, { input });
  }

  actor.start();

  if (event) {
    actor.send(event);
  }

  await waitFor(
    actor,
    (s) => isSettled(String(s.value), s.status),
    { timeout: timeoutMs },
  );

  const settled = actor.getSnapshot();
  const persisted = actor.getPersistedSnapshot();
  const transcript = settled.context.transcript;
  const newTurns = transcript.slice(input.initialMessages.length);

  actor.stop();

  return {
    snapshot: persisted,
    status: toStatus(String(settled.value), settled.status),
    transcript,
    newTurns,
    restoredFromSnapshot,
  };
};
```

If the `snapshot` cast above fights the compiler, simplify it — cast to the parameter type XState actually expects rather than the conditional gymnastics; the point is that a persisted snapshot round-trips through `unknown` at the database boundary. Report what you used.

- [ ] **Step 4: Run to verify passing**

Run: `pnpm vitest run src/lib/__tests__/onboarding-runner.test.ts`

Expected: PASS. If the round-trip test fails, do **not** loosen the assertion — it is the point of the task. Investigate whether `input` must be passed alongside `snapshot` on restore, and report what you found.

- [ ] **Step 5: Prove the round-trip test is not vacuous**

Temporarily change the restore branch so it never restores (force `versionMatches` to `false`). Re-run the test file. The round-trip test **must fail** — that is what proves it detects a broken transport. Restore the code and confirm it passes again. Report both observations.

- [ ] **Step 6: Types, formatting, full suite**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/lib/onboarding-runner.ts src/lib/__tests__/onboarding-runner.test.ts`
Run: `pnpm test` — no regressions; the machine's own 24 tests must still pass untouched.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding-runner.ts src/lib/__tests__/onboarding-runner.test.ts
git status --short
git commit -m "feat(onboarding): add the pure turn runner with snapshot restore"
```

---

## Task 4: Database additions

**Files:**
- Modify: `src/db/course.ts`
- Modify: `src/db/course-onboarding.ts`

**Interfaces:**
- Produces: `getCourseIdBySlug(slug: string): Promise<number | null>` in `src/db/course.ts`; `saveMachineSnapshot({ onboardingId, snapshot, version }): Promise<void>` in `src/db/course-onboarding.ts`.

**No unit tests** — both modules import `@/db`, unresolvable under vitest, matching the precedent that `src/db/course-progress.ts` and the rest of `src/db/course-onboarding.ts` have none. `tsc` is the verification.

**Why `getCourseIdBySlug` is additive rather than changing `loadOnboardingSession`:** that function takes a `courseId` and is already merged and reviewed. The routes receive a slug. Adding a resolver is additive; changing a merged signature is not.

- [ ] **Step 1: `getCourseIdBySlug`**

Append to `src/db/course.ts`, matching that file's existing double-quote style and its `eq` import:

```ts
/**
 * Resolve a course slug to its id. Returns null for an unknown slug so
 * callers can answer 404 rather than throwing.
 */
export async function getCourseIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.slug, slug));
  return row?.id ?? null;
}
```

- [ ] **Step 2: `saveMachineSnapshot`**

Append to `src/db/course-onboarding.ts`, matching its single-quote style:

```ts
/**
 * Persist the machine's settled state after a turn. `updatedAt` is set
 * explicitly — no table in this schema uses $onUpdate, and a stale
 * updatedAt would break the concurrency guard the routes rely on.
 */
export const saveMachineSnapshot = async ({
  onboardingId,
  snapshot,
  version,
}: {
  onboardingId: number;
  snapshot: unknown;
  version: string;
}): Promise<void> => {
  await db
    .update(courseOnboardingTable)
    .set({
      machineSnapshot: snapshot,
      machineVersion: version,
      updatedAt: sql`now()`,
    })
    .where(eq(courseOnboardingTable.id, onboardingId));
};
```

Check whether `sql` is already imported in that file; if the other writers use `new Date()` instead, match whichever they use rather than introducing a second idiom.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/db/course-onboarding.ts` (expect the 2 pre-existing `src/db/course.ts` findings to remain; do not fix them).

```bash
git add src/db/course.ts src/db/course-onboarding.ts
git status --short
git commit -m "feat(onboarding): add slug resolution and snapshot persistence"
```

---

## Task 5: Server glue and the three routes

**Files:**
- Create: `src/lib/onboarding-session.server.ts`
- Create: `src/routes/api/course/onboarding/start.ts`
- Create: `src/routes/api/course/onboarding/reply.ts`
- Create: `src/routes/api/course/onboarding/delete.ts`
- Create: `src/routes/api/course/onboarding/__tests__/start.test.ts`
- Create: `src/routes/api/course/onboarding/__tests__/reply.test.ts`
- Create: `src/routes/api/course/onboarding/__tests__/delete.test.ts`
- Modify: `src/routeTree.gen.ts` (regenerated)

**Interfaces:**
- `src/lib/onboarding-session.server.ts` produces:
  ```ts
  export type OnboardingTurnResponse = {
    status: OnboardingStatus;
    messages: UIMessageLike[];
    updatedAt: string;
  };
  export const advanceOnboarding: (args: {
    userId: string;
    courseSlug: string;
    event: OnboardingEvent | null;
    expectedUpdatedAt?: string | null;
  }) => Promise<
    | { ok: true; body: OnboardingTurnResponse }
    | { ok: false; reason: 'course_not_found' | 'stale' }
  >;
  export const deleteOnboardingSession: (args: {
    userId: string;
    courseSlug: string;
  }) => Promise<{ ok: boolean }>;
  ```
- Each route produces a `<name>Handler(request: Request): Promise<Response>` plus its `Route` export.

**The glue is where `initialMessageCount` and `initialMessages` finally get producers.** Both come from `loadOnboardingSession`'s `messages`: the count seeds `createOnboardingImplementations`, and `messageRowsToTranscript(messages)` seeds the machine's `initialMessages`. These were the two dangling wires the backend spec left.

**Security, non-negotiable:** every route derives `userId` from `auth.api.getSession` only. No route may read a user id from the body, query, or headers. `advanceOnboarding` takes `userId` as an argument precisely so the route is the only place a session is read.

**Concurrency:** `reply` accepts an optional `expectedUpdatedAt`. When present and it does not match the row's current `updatedAt`, return `{ ok: false, reason: 'stale' }` → HTTP 409. Without this, two tabs replying at once last-write-wins and one tab's turn vanishes invisibly.

- [ ] **Step 1: Write the server glue**

Create `src/lib/onboarding-session.server.ts`. It may import `@/db` freely (it is server-only, never imported by a test — the routes import it via `#/` and the tests mock that path). It must:

1. `getCourseIdBySlug(courseSlug)` → null means `{ ok: false, reason: 'course_not_found' }`.
2. `loadOnboardingSession({ userId, courseId })`.
3. If `expectedUpdatedAt` is supplied and differs from `row.updatedAt` serialised the same way → `{ ok: false, reason: 'stale' }`.
4. Build `input`: `{ onboardingId: row.id, questions, answers: row.answers, initialMessages: messageRowsToTranscript(messages) }`.
5. Build implementations: `createOnboardingImplementations({ courseName, initialMessageCount: messages.length, questions })`. Get `courseName` from the course row — extend `getCourseIdBySlug` to return the name too, or add a sibling query; say which you chose and why.
6. `runOnboardingTurn({ snapshot: row.machineSnapshot, snapshotVersion: row.machineVersion, input, implementations, event })`.
7. `saveMachineSnapshot({ onboardingId, snapshot, version: ONBOARDING_MACHINE_VERSION })`.
8. Return `{ ok: true, body: { status, messages: transcriptToUIMessages(transcript), updatedAt } }`.

Return the **full** transcript as `messages`, not just `newTurns` — the client renders the whole conversation and a full list is idempotent against a retried request. `newTurns` exists on `RunTurnResult` for callers that want a delta; this one does not need it. Note that decision in a comment so the unused field does not read as an oversight.

`deleteOnboardingSession` resolves the slug, loads the session, and calls the existing `deleteOnboarding({ onboardingId })`.

- [ ] **Step 2: Write the three failing handler tests**

Create the three test files, each mirroring `src/routes/api/course/__tests__/progress-summary.test.ts`'s structure exactly — `// @vitest-environment node`, `vi.hoisted`, `vi.mock` of the `#/` specifiers *before* importing the handler.

Each must cover, at minimum:
- 401 when unauthenticated, asserting the glue function was **not** called.
- The happy path, asserting the glue was called with the **session's** user id specifically (`toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))`).
- 404 when the glue reports `course_not_found`.
- 400 when the body fails validation (missing `courseSlug`; for `reply`, missing `text`).
- For `reply` only: 409 when the glue reports `stale`.
- A case proving a user id in the request body is ignored — send `{ courseSlug: 'x', text: 'hi', userId: 'attacker' }` and assert the glue still received `'user-1'`. This is the test that pins the authorization property rather than assuming it.

- [ ] **Step 3: Write the three routes**

Each follows `progress-summary.ts`: session guard first, zod-validate the body, call the glue via a `#/`-imported function, map the result to a status code. Validate bodies with zod (`courseSlug: z.string().min(1)`, and `text: z.string().min(1).max(5000)` for `reply` — matching `OnboardingAnswersSchema`'s per-answer cap so the transport cannot accept what storage would reject).

`createFileRoute('/api/course/onboarding/start')` and siblings, with `server.handlers.POST`.

- [ ] **Step 4: Run the handler tests**

Run: `pnpm vitest run src/routes/api/course/onboarding/__tests__/`

Expected: PASS, all three files.

- [ ] **Step 5: Regenerate the route tree**

Three new files under `src/routes/` means `src/routeTree.gen.ts` changes and **must be committed**.

Run: `pnpm build` — expect exit 0. Do **not** run `pnpm dev`.

Then `git diff --stat src/routeTree.gen.ts` and confirm the additions are only the three onboarding routes. If it shows unrelated churn, an external dev server may have regenerated it — say so rather than committing blindly.

- [ ] **Step 6: Types, formatting, full suite**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/lib/onboarding-session.server.ts src/routes/api/course/onboarding/`
Run: `pnpm test` — no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding-session.server.ts src/routes/api/course/onboarding/ src/routeTree.gen.ts
git status --short
git commit -m "feat(onboarding): add start/reply/delete routes and server glue"
```

---

## Task 6: The client hook

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-onboarding-chat.ts`

**Interfaces:**
- Produces: `dataKeys.onboardingSession(courseSlug)`; `useOnboardingChat(courseSlug: string)` returning `{ messages: UIMessage[]; status: OnboardingStatus | undefined; isLoading: boolean; sendMessage: (opts: { text: string }) => void; deleteSession: () => void; start: () => void }`.

**`sendMessage` must take an options object**, matching `ChatWindowProps.sendMessage: (opts: { text: string }) => void` (verified at `chat-window.tsx:16`). Naming and shaping it identically to Viper7's is what lets `chat-window.tsx` accept either mode's hook result with no change to the window itself.

Follow `src/data-hooks/use-my-courses.ts` for the query shape and its inline zod response schema (this repo defines response schemas in the hook, not in a shared module). Use `useMutation` for reply/delete, and `queryClient.setQueryData` to apply each response so the conversation updates without a refetch.

**The hook is the boundary where `UIMessageLike` must satisfy `ai`'s `UIMessage`.** Type `messages` as `UIMessage[]` here and let `tsc` prove the shape is compatible — that is what keeps `ChatWidgetMessages` unchanged. If it does not typecheck, fix the mapping in `onboarding-transport.ts`, not by loosening the type here.

Add an optimistic user turn on `sendReply` so the interview does not feel dead during the 3–6 second model round trip, and reconcile with the server's full transcript on success.

- [ ] **Step 1: Add the query key**

In `src/data-hooks/keys.ts`, in the `['user', ...]` namespace beside `myCourses`:

```ts
  onboardingSession: (courseSlug: string) =>
    ['user', 'onboarding-session', courseSlug] as const,
```

- [ ] **Step 2: Write the hook**

Create `src/data-hooks/use-onboarding-chat.ts` with an inline zod schema matching `OnboardingTurnResponse`:

```ts
const onboardingTurnSchema = z.object({
  status: z.enum([
    'awaiting_consent',
    'awaiting_answer',
    'confirming',
    'complete',
    'declined',
    'deleted',
    'paused',
    'failed',
  ]),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['assistant', 'user']),
      parts: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    }),
  ),
  updatedAt: z.string(),
});
```

Send `expectedUpdatedAt` on each reply from the last response's `updatedAt`, and surface a 409 as a distinguishable error the widget can render — not a generic failure toast, since "this conversation continued in another tab" is actionable and "something went wrong" is not.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — zero output. This is the real check: it proves `UIMessageLike` satisfies `UIMessage`.
Run: `pnpm exec biome check src/data-hooks/use-onboarding-chat.ts src/data-hooks/keys.ts`
Run: `pnpm test` — no regressions.

**No test for this hook**, matching `use-my-courses.ts`, `use-admin-courses.ts` and `use-course-progress-summary.ts`, none of which have one.

- [ ] **Step 4: Commit**

```bash
git add src/data-hooks/use-onboarding-chat.ts src/data-hooks/keys.ts
git status --short
git commit -m "feat(onboarding): add the onboarding chat client hook"
```

---

## Task 7: Widget mode and the course-page prompt

**Files:**
- Modify: `src/atoms/chat-widget.ts`
- Modify: `src/components/chat-widget/chat-widget.tsx`
- Modify: `src/components/chat-widget/chat-window.tsx`
- Create: `src/components/courses/onboarding-prompt.tsx`
- Create: `src/components/courses/__tests__/onboarding-prompt.test.tsx`
- Modify: `src/routes/_authed/course.$courseSlug.index.tsx`

**Interfaces:**
- Produces: `chatWidgetModeAtom` (`{ kind: 'viper7' } | { kind: 'onboarding'; courseSlug: string }`, default `viper7`); `OnboardingPrompt` (presentational).

**Do not modify** `chat-widget-messages.tsx`, `chat-message.tsx`, `chat-widget-input.tsx`, `typing-dots.tsx`, or any geometry hook. They are shared with the shipped Viper7 chat and already take props.

`chat-widget.tsx` reads the mode atom and calls either `useChatWidget()` or `useOnboardingChat(courseSlug)`. **Both hooks must be called unconditionally** — React forbids conditional hook calls. Call both and select which result to pass down, or split the widget into two sibling containers each calling one. Pick one and say which; if you call both, `useOnboardingChat` must be inert when `courseSlug` is absent (an `enabled: false` query), so the Viper7 path fires no onboarding requests.

`chat-window.tsx` already receives `messages` / `sendMessage` / `isLoading` as props — verify that and extend only if the onboarding mode needs something it cannot express, reporting what you added and why.

`OnboardingPrompt` is presentational: props only, a "Start" action and a "Not now" dismissal, using logical Tailwind properties (`ps-*`/`pe-*`/`text-start`, never `pl-*`/`text-left`) per `CLAUDE.md`. Dismissal is client-side only for now — it must **not** call the delete endpoint, which is a different, destructive action.

Its test renders it from props and asserts both actions fire their callbacks.

`course.$courseSlug.index.tsx` renders the prompt when `shouldOfferOnboarding(row)` is true. It needs the row; if no existing hook exposes it, use the onboarding query's own status (`status === 'awaiting_consent'` and no prior turns) or add a small query — say which you chose.

- [ ] **Step 1: Add the mode atom**

In `src/atoms/chat-widget.ts`, beside the existing `chatWidgetOpenAtom` and `chatWidgetFontSizeAtom`, matching their style:

```ts
/**
 * Which conversation the shared chat window is driving. Onboarding reuses the
 * widget rather than getting its own surface, so the container needs to know
 * which data layer to feed the window — the window and every component below
 * it are mode-agnostic and take props.
 */
export type ChatWidgetMode =
  | { kind: 'viper7' }
  | { kind: 'onboarding'; courseSlug: string };

export const chatWidgetModeAtom = atom<ChatWidgetMode>({ kind: 'viper7' });
```

Check whether the existing atoms use `atomWithStorage`; if the open/font-size atoms persist, decide deliberately whether mode should too and say why. Mode should **not** persist across sessions — a stale `onboarding` mode pointing at a course the user has since finished would open the widget into a dead conversation.

- [ ] **Step 2: Write the prompt component and its failing test, then make it pass**
- [ ] **Step 3: Wire the widget's mode selection**
- [ ] **Step 4: Render the prompt from the course index route**
- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm test` — no regressions. The chat-widget's existing tests must pass **unmodified**; if any needs changing, you have touched a shared presentational component — stop and report it.
Run: `pnpm exec biome check` on each file you touched.
`git diff --stat src/routeTree.gen.ts` — should be empty (no route files added or removed; `course.$courseSlug.index.tsx` only changes contents).

- [ ] **Step 6: Commit**

```bash
git add src/atoms/chat-widget.ts src/components/chat-widget/chat-widget.tsx src/components/chat-widget/chat-window.tsx src/components/courses/ "src/routes/_authed/course.\$courseSlug.index.tsx"
git status --short
git commit -m "feat(onboarding): offer onboarding in the chat widget from the course page"
```

---

## Task 8: Final verification

**Files:** none modified.

- [ ] **Step 1: Full suite**

Run: `pnpm test` — zero failures, and no fewer test files than after Task 7.

- [ ] **Step 2: Types**

Run: `pnpm exec tsc --noEmit` — zero output.

- [ ] **Step 3: Confirm the shared widget is untouched**

Run: `git diff --stat main..HEAD -- src/components/chat-widget/`

Expected: only `chat-widget.tsx` and `chat-window.tsx`. Any presentational component or geometry hook in that list means shipped Viper7 UI was modified — investigate before proceeding.

- [ ] **Step 4: Confirm the machine was not modified beyond the version constant**

Run: `git diff main..HEAD -- src/machines/onboarding-machine.ts`

Expected: only the `ONBOARDING_MACHINE_VERSION` export. The machine's behaviour is covered by 24 tests written against the merged version; transport work must not change it.

- [ ] **Step 5: Biome**

Run: `pnpm exec biome check src/lib/ src/data-hooks/ src/routes/api/course/onboarding/ src/components/courses/`

Pre-existing findings elsewhere are not yours — compare against `main` if unsure.

- [ ] **Step 6: Ask the user to apply the schema**

Do not run it yourself. Post:

> Backend and UI are complete. Please run `pnpm db:push` to add `machine_snapshot` and `machine_version` to `course_onboarding`, then confirm.

Once confirmed, verify both columns exist and are nullable.

- [ ] **Step 7: Report the pending manual walkthrough**

The browser flow — prompt appears, widget opens in onboarding mode, consent gate, one question at a time, close and reopen resumes — cannot be verified from tests and is a human step. Report it as pending; do not claim it done.

---

## Done criteria

- `pnpm test` passes with no regressions against the 104-file / 607-test baseline.
- `pnpm exec tsc --noEmit` reports zero output.
- The snapshot round-trip test passes **and** was demonstrated to fail when restore is disabled.
- `machine_snapshot` and `machine_version` exist in the database, both nullable.
- No presentational chat-widget component and no geometry hook was modified.
- `src/machines/onboarding-machine.ts` changed only by the version constant.
- The machine's 24 existing tests pass unmodified.

## Explicitly out of scope

- Streaming responses (the machine needs a complete turn to transition).
- Adopting `@astryxdesign/core` — evaluated and deferred; see the spec's appendix.
- Guarding `/api/course/details`, `/api/lesson/material`, `/api/lesson/video`, which remain unauthenticated. Tracked from the routing spec; must close before a second course exists.
- Making the Viper7 chat course-aware or touching `src/ai/tools/search-kb.ts`.
- Admin views over transcripts.
- Fixing the correction-loop limitation documented in the machine's spec (a summary correction never reaches `answers`).
