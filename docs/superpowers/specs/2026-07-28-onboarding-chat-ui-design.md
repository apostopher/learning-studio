# Onboarding Chat UI — Transport and Widget Wiring

**Date:** 2026-07-28
**Status:** Approved, ready for planning
**Scope:** The transport layer between the onboarding machine and the browser, plus wiring it into the existing chat widget.
**Builds on:** `docs/superpowers/specs/2026-07-28-onboarding-agent-design.md` (the machine, actors and persistence, all merged to `main`)

## Context

The onboarding backend is complete and on `main`: an XState 5 machine (`src/machines/onboarding-machine.ts`, 24 transition tests), six AI actors under `src/ai/onboarding/`, persistence in `src/db/course-onboarding.ts`, and a wiring factory `createOnboardingImplementations`.

What does not exist is any way to reach it. The machine's spec deliberately deferred transport — "no UI, no route; that wiring comes later". Specifically:

- No API route drives the machine.
- `createOnboardingImplementations`'s `initialMessageCount` has no producer.
- The machine's `transcript` input field is never populated, though `loadOnboardingSession` already returns the messages to populate it from.

A chat widget already exists at `src/components/chat-widget/` — a draggable, resizable, free-floating window with a launcher bubble, used for the Viper7 assistant. It has its own geometry hooks, push-to-talk, audio recording, and a typing indicator.

## Non-goals

- Streaming responses (see Latency).
- Replacing the widget's presentational components with a third-party library (see Deferred: Astryx).
- Admin views over transcripts.
- Making the Viper7 chat course-aware, or touching `src/ai/tools/search-kb.ts`.
- Guarding the pre-existing unauthenticated learner endpoints (`/api/course/details`, `/api/lesson/material`, `/api/lesson/video`) — tracked separately; see the routing spec.

## Decisions

**The onboarding conversation reuses the existing floating widget** rather than getting an inline panel or its own route. One surface to build and maintain, and the draggable window already works. The obvious objection — that a user can close a 15-minute interview mid-flow — is not a real cost: the machine was built for pause and resume, `onboardingCompletedAt` is nullable precisely for this, and the transcript persists. Closing is a supported path, not a loss.

Consequence: the widget is shared with Viper7, so any change to its *presentational* parts affects shipped UI. This spec therefore changes only the container layer and adds a mode; the presentational components are untouched.

**The server drives the machine, rehydrated per request.** The deploy is request-scoped (Vercel), so no actor is held in memory. Each turn loads the row and transcript, restores the machine, applies the event, waits for it to settle, persists, and responds.

Rejected: keeping actors alive in a server-side map (needs server affinity, leaks on abandoned interviews, drops in-flight conversations on every deploy). Rejected: driving the machine client-side (it would put the consent gate and the follow-up cap under client control, and those are the feature's safety properties).

**The machine's in-flight state is persisted as an XState snapshot.**

This is not optional, and naive rehydration would have been a silent defect. `OnboardingContext` has ten fields. Only two are reconstructible from the database — `transcript` from the messages table, and `currentQuestionId` from `pendingQuestions()`, which is why it was deliberately built as derived. The other eight are not:

| Field | Consequence of rebuilding fresh each turn |
|---|---|
| `followUpCount` | **The follow-up cap stops working** — resets to 0 every turn, so `needs_follow_up` loops without bound. |
| `consentClarificationCount` | Same for the consent gate's clarification cap; ambiguity could be clarified forever instead of resolving to declined. |
| `hesitancyFlagged` | Set on one turn, read on the next. Lost — so the control reminder never fires. |
| `pendingFollowUp` | Lost — the follow-up question is never delivered. |
| `pendingCorrection` | Lost — a summary correction never reaches the summariser. |
| `turnCount` | Resets, so the turn-count control reminder never fires. |
| `lastReply`, `lastClarification` | Lost — the same "computed then discarded" failure this feature produced repeatedly during backend work. |

So: two new columns, `machine_snapshot jsonb` and `machine_version varchar(32)`. After each settled turn, persist `actor.getPersistedSnapshot()`; on the next turn restore with `createActor(machine, { snapshot })`.

**A failed restore degrades gracefully, and the guard should exploit that.** If a deploy changes the machine's shape and an old snapshot will not load, discard it and start fresh. `answers` is a separate durable column, so `pendingQuestions()` places the user at their next unanswered question. They lose the loop counters and any in-flight follow-up — not their interview. Because the failure mode is mild, the version guard should be biased toward discarding: on any doubt, start fresh rather than attempting a partial restore.

**Onboarding is offered by a dismissible prompt, not by auto-opening the widget.**

`docs/onboarding.md` leads with consent and requires the user never feel extracted from. Auto-opening a chat window before the user has agreed to anything contradicts that one level above where the consent gate sits. The course page surfaces a prompt; clicking it opens the widget in onboarding mode.

## Schema changes

Additive, applied with `pnpm db:push` (this repo's convention).

```ts
// course_onboarding — two new columns
// The machine's settled state after the last turn, from
// actor.getPersistedSnapshot(). Restored with createActor(machine, { snapshot }).
// Without this, rehydrating per request resets followUpCount and
// consentClarificationCount every turn, disabling both caps.
machineSnapshot: jsonb("machine_snapshot"),

// Guards the snapshot against machine-shape changes across deploys. On
// mismatch the snapshot is discarded and the machine starts fresh — safe,
// because `answers` is durable and pendingQuestions() resumes at the next
// unanswered question.
machineVersion: varchar("machine_version", { length: 32 }),
```

Both nullable: null means "no settled turn yet", which is the state before the greeting runs.

## API surface

Three routes under `src/routes/api/course/onboarding/`, each auth-guarded via `auth.api.getSession` and each deriving the user **only** from the session — never from the request body. They follow `src/routes/api/course/progress-summary.ts`'s shape, including importing collaborators via `#/` so handler tests can `vi.mock` them.

**`POST /start`** — `{ courseSlug }`. Idempotent. Loads or creates the row (freezing `questionSource`), and if there is no snapshot, runs the machine to its first waiting state so the greeting is produced. Returns the full transcript plus a status.

**`POST /reply`** — `{ courseSlug, text }`. Restores, sends `{ type: 'REPLY', text }`, waits for the machine to settle at a waiting state, persists snapshot and transcript, and returns the new assistant turns plus a status.

**`POST /delete`** — `{ courseSlug }`. The tombstone path already built: clears `answers`, deletes the transcript, stamps `deletedAt`, keeps the row. Implements `onboarding.md`'s "stop and delete everything shared, no explanation needed."

Pause needs no endpoint — it is the absence of further requests.

Every response carries a status the client renders against, derived from the machine's settled state: `awaiting_consent`, `awaiting_answer`, `confirming`, `complete`, `declined`, `deleted`, `failed`. The client must not infer state from message content.

### Settling

"Waits for the machine to settle" means waiting until it reaches a state that expects user input (`awaitingConsent`, `awaitingAnswer`, `confirming`) or a final state. The implementation needs a single predicate for this, shared by all three routes, so the definition of "settled" cannot drift between them.

## Client wiring

The widget's container gains a mode; nothing below it changes.

- `src/components/chat-widget/use-chat-widget.ts` currently owns Viper7's message state. Onboarding needs a sibling — a hook that posts to the onboarding routes and exposes the same message/loading shape the presentational components already consume.
- `src/components/chat-widget/chat-widget.tsx` selects which conversation the window is driving.
- `chat-widget-header.tsx` reflects which conversation is open.
- `chat-widget-messages.tsx`, `chat-message.tsx`, `chat-widget-input.tsx`, `typing-dots.tsx` are **unchanged** — they already take props.

The course page (`/course/$courseSlug`) consults `shouldOfferOnboarding` on the loaded row and renders the prompt when it returns true.

## Risks accepted

**Latency.** Each turn is two sequential model calls — `evaluateReply` on Sonnet, then `askQuestion` on Flash — so realistically 3–6 seconds of typing indicator per turn. The machine needs a complete turn before it can transition, which is why the backend spec chose non-streaming. Accepted for v1. If it reads as slow in use, the fix is streaming the assistant *text* while keeping transitions non-streamed; that is a larger change and out of scope here.

**Concurrent tabs.** The row's unique index does not protect the snapshot column, so two tabs replying simultaneously would last-write-wins and one tab's turn would silently vanish. Mitigation: compare `updatedAt` on write and reject a stale turn with a 409, which the client surfaces as "this conversation continued elsewhere." Cheap, and without it the failure is invisible.

## Verification

- Snapshot round-trip: restoring preserves `followUpCount`, so the follow-up cap still bounds the loop across simulated request boundaries. This is the test that proves the transport does not defeat the machine's safety properties.
- Version mismatch discards the snapshot, starts fresh, and still resumes at the next unanswered question because `answers` survived.
- Each route rejects an unauthenticated request and never accepts a user id from the body.
- The settled-state predicate is exercised directly, including that it does not treat a mid-flight state as settled.
- A stale-`updatedAt` reply is rejected with 409.
- The machine's existing 24 tests continue to pass untouched — transport changes must not require editing them.

## Deferred: Astryx

`@astryxdesign/core`'s `Chat` primitives were evaluated for the widget and deliberately not adopted now, to avoid restyling shipped Viper7 UI on a `0.1.9` dependency while onboarding is the goal. Recording the findings so the decision can be revisited without redoing the research:

- **No StyleX compiler needed.** The published `dist` contains literal precompiled StyleX class names, so only the small `@stylexjs/stylex` runtime (for its `props()` merge helper) is required — no babel plugin, no bundler integration, nothing touching this repo's Vite 8 / rolldown setup.
- **Theming is CSS custom properties.** The precompiled `dist/astryx.css` reads `var(--color-…)` in ~190 places, so overriding the variables restyles the components. No theme package required.
- **This repo's tokens are already Astryx-shaped**, because the token architecture was explicitly Astryx-derived: 29 of Astryx's 64 semantic color tokens are already defined with identical names in `src/styles/tokens.css`.
- **The bridge is about 15 lines.** Astryx reads long-form names internally (`--color-background-surface`, `--color-text-secondary`); this repo adopted the short Tailwind-bridge names (`--color-surface`, `--color-secondary`). Of the 80 semantic vars the compiled CSS consumes, 21 already match, 40 are decorative hue families (badges/tags), 4 are syntax-highlighting, and 15 are core semantics needing a one-line alias each.
- **Do not import Astryx's `tailwind-theme.css`.** It generates `text-primary` / `bg-surface` utilities, names this repo's own `@theme static` block already owns. Write the variable bridge instead.
- Their Chat set would replace the *inside* of the window (`ChatMessageList`, `ChatMessage`, `ChatMessageBubble`, `ChatComposer`, `ChatSendButton`, plus `ChatToolCalls` and `ChatSystemMessage`, which suit an agent-driven flow). It would not replace the window itself — the geometry, launcher and resize handles are not Astryx's concern. `useChatDictation` / `useSpeechRecognition` overlap the existing `use-push-to-talk` / `use-audio-recorder`, so that would be an either/or.
