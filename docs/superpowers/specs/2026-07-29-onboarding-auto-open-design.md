# Onboarding Auto-Open — Design

**Date:** 2026-07-29
**Status:** Approved, ready for planning
**Scope:** Auto-open the chat widget into onboarding mode when a learner visits a course page and has never engaged with onboarding for it.
**Builds on:** `docs/superpowers/specs/2026-07-28-onboarding-chat-ui-design.md` (transport, widget wiring — merged to `main`)

## Context

The chat-widget onboarding flow is live on `main`: visiting `/course/$courseSlug` shows a dismissible "Start" / "Not now" prompt when `useOnboardingChat`'s own status reads `awaiting_consent` with no prior user turn. Clicking "Start" sets `chatWidgetModeAtom` to `{ kind: 'onboarding', courseSlug }` and opens the widget.

This spec replaces that prompt with automatic behavior: if the learner has never engaged with onboarding for this course, the widget opens itself, already showing the greeting/consent message, with no click required.

**Explicit reversal of a prior decision, made deliberately:** the original design chose a dismissible prompt specifically so nothing happened "before the user has agreed to anything." This spec overrides that. The mitigating fact that made this acceptable: the machine's first message *is* the consent request — auto-opening doesn't skip consent, it only removes the extra click before seeing the same message "Start" used to lead to.

## Decisions

**Auto-open triggers only for "never started."** Defined precisely: no `course_onboarding` row exists yet, or one exists but is not closed (not declined/deleted/complete) and has zero messages with `role = 'user'`. A declined, deleted, completed, or mid-interview (paused) session is left alone — revisiting the course page never forces the widget open for those. Rejected: also auto-resuming a paused mid-interview on every visit (chosen as more likely to feel naggy than helpful) and re-opening for a declined session (re-asking someone who already said no).

**No dismissal memory.** If the learner closes the auto-opened widget without responding, it opens again on their next visit to the course page — and, within one visit, does not reopen just because of an unrelated re-render (see Client wiring). Chosen for simplicity: no atom, no session-scoped tracking, one rule ("still not_started → open").

**The prompt is removed, not kept as a fallback.** `OnboardingPrompt`, its test, and `onboardingPromptDismissedAtom` are deleted. Auto-open is the only path into onboarding from the course page now.

**Status is computed without running the machine.** A new route reads only the row's timestamps and a cheap existence check on message rows — no `createActor`, no snapshot restore, no model call. This is what makes it safe to call on every course-page render, unlike the existing `useOnboardingChat`-based check it replaces (which fires a mutating `POST /start`, invoking the greet actor, merely by loading the page — a gap the final review on the prior plan flagged and deferred; this spec closes it as a side effect of building the new endpoint the right way).

**A new, distinctly-named, coarser status type.** `useOnboardingChat`'s `OnboardingStatus` (`onboarding-transport.ts`) is the machine's per-turn state, needed by the chat window UI (`awaiting_consent` / `awaiting_answer` / `confirming` / etc.). The new endpoint answers a different, coarser question — "has this learner engaged with onboarding at all" — so it gets its own type rather than overloading the existing one:

```ts
export type OnboardingProgress =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'declined'
  | 'deleted';
```

## API surface

**`POST /api/course/onboarding/status`** — `{ courseSlug }`. Auth-guarded via `auth.api.getSession`, deriving `userId` only from the session, matching every other route in `src/routes/api/course/onboarding/`. Read-only: no row is created, no write of any kind happens.

Server logic (`getOnboardingProgress({ userId, courseSlug })` in `onboarding-session.server.ts`, alongside `advanceOnboarding`/`deleteOnboardingSession`):

1. Resolve `courseSlug` via `getCourseIdentityBySlug`; 404 if not found (matching the existing routes).
2. `SELECT` the `course_onboarding` row for `(userId, courseId)` directly — no `loadOnboardingSession` (which creates a row as a side effect) and no `runOnboardingTurn`.
3. No row → `{ status: 'not_started' }`.
4. Row exists: reuse the already-exported `closedSessionStatus(row)` — if it returns non-null (`'declined'` | `'deleted'` | `'complete'`), return that verbatim (these three values are shared vocabulary between `OnboardingStatus` and `OnboardingProgress` on purpose, so no translation table is needed for them).
5. Row exists, not closed: check whether any `course_onboarding_messages` row for this `onboardingId` has `role = 'user'` (a cheap indexed existence check, not a full transcript read). None → `'not_started'`. At least one → `'in_progress'`.

Response: `{ status: OnboardingProgress }`.

## Client wiring

**`src/data-hooks/use-onboarding-status.ts`** — `useOnboardingStatus(courseSlug: string)`, a plain `useQuery` (following `use-my-courses.ts`'s shape, inline zod response schema per this repo's convention) returning `{ status: OnboardingProgress | undefined, isLoading: boolean }`. A moderate `staleTime` (not `Infinity` — this reflects ongoing DB state a background actor doesn't change on its own the way a chat turn does, but doesn't need aggressive polling either); exact value decided at implementation time, default to this repo's standard 5-minute convention unless a reason emerges to deviate.

**`course.$courseSlug.index.tsx`** calls `useOnboardingStatus(courseSlug)` in place of today's `useOnboardingChat`-based check, and adds:

```ts
useEffect(() => {
  if (status === 'not_started') {
    setMode({ kind: 'onboarding', courseSlug });
    setOpen(true);
  }
}, [status, courseSlug, setMode, setOpen]);
```

Because `useEffect` only re-runs when a dependency's *value* changes, this fires once per distinct `status` value: closing the widget mid-visit doesn't reopen it on an unrelated re-render (status is still `'not_started'`, same string, effect doesn't re-fire), but a fresh page visit (component remount) re-evaluates and reopens if still `'not_started'` — matching the "every visit until they respond" decision with no extra state.

Once the learner replies (even just to answer the consent question), the server-side check in step 5 above finds a `role = 'user'` message and flips the status to `'in_progress'` on the next read, so the effect's condition stops matching.

## What's removed

- `src/components/courses/onboarding-prompt.tsx` and its test.
- `onboardingPromptDismissedAtom` in `src/atoms/chat-widget.ts`.
- The course page's existing `useOnboardingChat(courseSlug)` call used solely to derive `shouldOffer` — replaced by `useOnboardingStatus`. (`useOnboardingChat` itself is untouched; `OnboardingChat` in `chat-widget.tsx` still uses it once the widget is actually open, unchanged.)

## Non-goals

- Auto-resuming a paused mid-interview session (only the never-started case auto-opens).
- Any change to the machine, the existing three mutating routes (`start`/`reply`/`delete`), or any presentational chat-widget component.
- Streaming, admin visibility, or anything else already out of scope per the prior plan.

## Risks accepted

**A learner who closes the widget every time without responding sees it reopen on every course-page visit, indefinitely.** Deliberately accepted (see Decisions) — the alternative (dismissal memory) was explicitly rejected for simplicity. If this reads as naggy in practice, the fix is additive (a dismissal atom), not a redesign.

**The coarse `OnboardingProgress` type and the machine's `OnboardingStatus` share three string values (`declined`/`deleted`/`complete`) by convention, not by a shared type alias.** If a future change to one's vocabulary isn't mirrored in the other, nothing typechecks against it — noted so it isn't mistaken for an oversight later.

## Verification

- The new route creates zero rows and issues zero writes for a course with no `course_onboarding` row at all (a plain `SELECT`, asserted via a mocked DB layer the same way `reply.test.ts`/`start.test.ts` assert on their collaborators).
- `closedSessionStatus`'s three closed values map through unchanged (reusing its existing test coverage — no new precedence logic to re-test).
- The "any user message" check is exercised for both an empty and a non-empty case.
- The course page's effect is proven to fire when status is `not_started` and to NOT fire (or re-fire) for `in_progress`/`complete`/`declined`/`deleted`.
- Every route rejects an unauthenticated request, matching `start.ts`/`reply.ts`/`delete.ts`'s existing tests.
