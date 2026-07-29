# Onboarding Auto-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a learner visits `/course/$courseSlug` and has never engaged with onboarding for it, auto-open the chat widget into onboarding mode showing the greeting/consent message — no click required — and remove the old dismissible "Start"/"Not now" prompt it replaces.

**Architecture:** A new read-only status route + DB reads (no machine run, no model call, no writes) answers "has this learner engaged with onboarding at all"; a thin TanStack Query hook wraps it; the course page's container reacts to `'not_started'` by setting the two jotai atoms that already open the widget in onboarding mode (unchanged since the prior plan). Nothing in `src/components/chat-widget/` or `src/machines/` is touched by this plan.

**Tech Stack:** TanStack Start (routes) + TanStack Query (hook) + Drizzle/Postgres (DB reads) + Jotai (widget mode/open atoms, already exist) + Zod (response schema) + Vitest (route/server tests).

## Global Constraints

- **`@/` never resolves under vitest; `#/` does.** `src/db/course-onboarding.ts` uses `@/db`/`@/db/schema` (no test imports it directly — it's mocked at the server layer, matching `loadOnboardingSession`/`saveMachineSnapshot`/etc., none of which have direct tests). `src/lib/onboarding-session.server.ts` and route files use `#/`, and their tests `vi.mock` those same `#/` specifiers before importing the handler — follow `src/routes/api/course/onboarding/start.ts` and its test exactly.
- **The new route must never create a row or run the machine.** `findOnboardingRow` (Task 1) is a plain `SELECT`, unlike `loadOnboardingSession` which creates a row if none exists — reusing the latter here would defeat the entire point of a side-effect-free status check.
- **`closedSessionStatus`'s return type must be tightened from `OnboardingStatus | null` to `'deleted' | 'declined' | 'complete' | null`** (Task 2). It already only ever returns those three values at runtime; narrowing the type is what lets both `advanceOnboarding` (existing caller, unaffected — a narrower literal type is still assignable to `OnboardingStatus`) and the new `getOnboardingProgress` (needs `OnboardingProgress`) accept its result with zero casts, and `tsc` is what proves the sharing is safe rather than merely assumed.
- **`OnboardingProgress` is a distinct type from `OnboardingStatus`.** `OnboardingStatus` (`onboarding-transport.ts`) is the machine's per-turn state, needed by the chat window. `OnboardingProgress` (new, in `onboarding-session.server.ts`) answers a coarser question for the course page. They share three string values by convention, not a type alias — do not merge them.
- **Single quotes (biome `quoteStyle: 'single'`)** in every new/touched file (this plan never touches `src/db/schema.ts`).
- **`src/routeTree.gen.ts` is git-tracked.** Adding `src/routes/api/course/onboarding/status.ts` regenerates it — run `pnpm build` (exits 0 in ~1s) and stage the result. Never `pnpm dev` (long-running, won't exit; an external dev server on port 5001 may already be running — don't disturb it).
- **Never `git add -A`.** Stage explicit paths; `git status --short` before every commit. Must NOT be staged: `CLAUDE.md`, `docs/onboarding.md`, `src/common/config.ts` (the human partner's own uncommitted files, unrelated to this plan).
- **Do not touch** `src/machines/onboarding-machine.ts`, anything under `src/components/chat-widget/`, or `src/data-hooks/use-onboarding-chat.ts`. This plan only adds a new read path and rewires the course page's *trigger* for opening the widget — the widget itself, once open, behaves exactly as it does today.
- **Verified baseline (this branch, `main`):** `pnpm exec tsc --noEmit` clean; `pnpm test` — 111 files / 699 passed / 28 skipped. Any tsc output or test regression is yours.
- Vitest prints `close timed out after 10000ms / something prevents Vite server from exiting` after the summary — a pre-existing config quirk, not a failure. Judge from the `Test Files` / `Tests` summary lines.

---

## Task 1: Read-only DB reads — row lookup and reply-existence check

**Files:**
- Modify: `src/db/course-onboarding.ts`

**Interfaces:**
- Produces: `findOnboardingRow({ userId, courseId }): Promise<CourseOnboardingSelect | null>`; `hasUserReply({ onboardingId }): Promise<boolean>`.

No test file for this task — matches this module's existing convention (`loadOnboardingSession`, `saveMachineSnapshot`, `clearMachineSnapshot`, etc. have no direct tests; they're exercised only through the server-layer's mocked tests, which is exactly how Task 2 verifies these two).

- [ ] **Step 1: Add `findOnboardingRow`**

Beside `loadOnboardingSession` in `src/db/course-onboarding.ts`:

```ts
/**
 * Reads the course_onboarding row for this user+course WITHOUT creating one —
 * unlike loadOnboardingSession, which always creates a row so the machine has
 * something to run against. A pure status check must never have that side
 * effect: merely checking whether onboarding has started must not itself
 * start it.
 */
export const findOnboardingRow = async ({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}): Promise<CourseOnboardingSelect | null> => {
  const [row] = await db
    .select()
    .from(courseOnboardingTable)
    .where(
      and(
        eq(courseOnboardingTable.userId, userId),
        eq(courseOnboardingTable.courseId, courseId),
      ),
    );

  return row ?? null;
};
```

- [ ] **Step 2: Add `hasUserReply`**

```ts
/**
 * Whether the learner has ever sent at least one reply for this onboarding
 * session — the signal that distinguishes "greeted but never responded to
 * consent" from "actually engaged," without reading the machine's internal
 * state (which would couple this check to the machine's state-name shape,
 * something Task 2's design note explicitly avoids).
 */
export const hasUserReply = async ({
  onboardingId,
}: {
  onboardingId: number;
}): Promise<boolean> => {
  const [row] = await db
    .select({ id: courseOnboardingMessagesTable.id })
    .from(courseOnboardingMessagesTable)
    .where(
      and(
        eq(courseOnboardingMessagesTable.onboardingId, onboardingId),
        eq(courseOnboardingMessagesTable.role, 'user'),
      ),
    )
    .limit(1);

  return row != null;
};
```

`courseOnboardingMessagesTable` is already imported in this file. `and`/`eq` are already imported from `drizzle-orm`.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/db/course-onboarding.ts`.
Run: `pnpm test` — no regressions (this file has no direct tests, so this only confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/db/course-onboarding.ts
git status --short
git commit -m "feat(onboarding): add read-only row lookup and reply-existence check"
```

---

## Task 2: Server logic + the status route

**Files:**
- Modify: `src/lib/onboarding-session.server.ts`
- Modify: `src/lib/__tests__/onboarding-session.test.ts` (already exists — extend it, matching the `advanceOnboarding` describe block's existing mocking pattern)
- Create: `src/routes/api/course/onboarding/status.ts`
- Create: `src/routes/api/course/onboarding/__tests__/status.test.ts`

**Interfaces:**
- Consumes: `findOnboardingRow`, `hasUserReply` (Task 1); `getCourseIdentityBySlug` (`#/db/course`, already exists); `closedSessionStatus` (this file, retyped below).
- Produces: `OnboardingProgress` (`'not_started' | 'in_progress' | 'complete' | 'declined' | 'deleted'`); `getOnboardingProgress({ userId, courseSlug }): Promise<{ ok: true; status: OnboardingProgress } | { ok: false; reason: 'course_not_found' }>`; `POST /api/course/onboarding/status` accepting `{ courseSlug }`, returning `{ status: OnboardingProgress }`.

- [ ] **Step 1: Retype `closedSessionStatus`'s return value**

In `src/lib/onboarding-session.server.ts`, change:

```ts
export const closedSessionStatus = ({
  deletedAt,
  consentDeclinedAt,
  onboardingCompletedAt,
}: {
  deletedAt: Date | null;
  consentDeclinedAt: Date | null;
  onboardingCompletedAt: Date | null;
}): OnboardingStatus | null => {
```

to:

```ts
export const closedSessionStatus = ({
  deletedAt,
  consentDeclinedAt,
  onboardingCompletedAt,
}: {
  deletedAt: Date | null;
  consentDeclinedAt: Date | null;
  onboardingCompletedAt: Date | null;
}): 'deleted' | 'declined' | 'complete' | null => {
```

The function body is unchanged — it already only ever returns one of those three strings or `null`. `advanceOnboarding`'s existing usage (assigning `closed` into `body: { status: closed, ... }` typed as `OnboardingTurnResponse['status']: OnboardingStatus`) still compiles unchanged, since a narrower literal union is assignable to the wider one.

- [ ] **Step 2: Add `OnboardingProgress` and `getOnboardingProgress`**

Beside `closedSessionStatus` and above `advanceOnboarding`:

```ts
/**
 * A coarser status than OnboardingStatus (the machine's per-turn state):
 * answers "has this learner engaged with onboarding at all," which is all
 * the course page needs to decide whether to auto-open the widget. Shares
 * its three closed values with OnboardingStatus by convention, not by type
 * alias — see closedSessionStatus's retyped signature above.
 */
export type OnboardingProgress =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'declined'
  | 'deleted';

export type GetOnboardingProgressResult =
  | { ok: true; status: OnboardingProgress }
  | { ok: false; reason: 'course_not_found' };

/**
 * Answers "should the widget auto-open into onboarding for this learner and
 * course" without ever running the machine: at most one plain SELECT
 * (findOnboardingRow, which — unlike loadOnboardingSession — never creates a
 * row) plus one existence check on the messages table. No model call, no
 * snapshot restore, no write of any kind — safe to call on every
 * course-page render.
 */
export const getOnboardingProgress = async ({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<GetOnboardingProgressResult> => {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) {
    return { ok: false, reason: 'course_not_found' };
  }

  const row = await findOnboardingRow({ userId, courseId: course.id });
  if (!row) {
    return { ok: true, status: 'not_started' };
  }

  const closed = closedSessionStatus(row);
  if (closed) {
    return { ok: true, status: closed };
  }

  const engaged = await hasUserReply({ onboardingId: row.id });
  return { ok: true, status: engaged ? 'in_progress' : 'not_started' };
};
```

Add `findOnboardingRow` and `hasUserReply` to the existing `#/db/course-onboarding` import at the top of the file.

- [ ] **Step 3: Extend the server test**

In `src/lib/__tests__/onboarding-session.test.ts`, add `findOnboardingRow` and `hasUserReply` to the `vi.hoisted`/`vi.mock('#/db/course-onboarding', ...)` block already there (alongside `loadOnboardingSession`/`saveMachineSnapshot`/`clearMachineSnapshot`/`deleteOnboarding`), then add:

```ts
describe('getOnboardingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseIdentityBySlug.mockResolvedValue({ id: 1, name: 'PPL' });
  });

  it('returns course_not_found when the slug does not resolve', async () => {
    getCourseIdentityBySlug.mockResolvedValueOnce(null);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'nope',
    });
    expect(result).toEqual({ ok: false, reason: 'course_not_found' });
    expect(findOnboardingRow).not.toHaveBeenCalled();
  });

  it('returns not_started when no row exists, without checking for a reply', async () => {
    findOnboardingRow.mockResolvedValue(null);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'not_started' });
    expect(hasUserReply).not.toHaveBeenCalled();
  });

  it('reports a closed status without checking for a reply', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: new Date(),
    });
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'complete' });
    expect(hasUserReply).not.toHaveBeenCalled();
  });

  it('returns not_started when the row is open and has no user reply yet', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: null,
    });
    hasUserReply.mockResolvedValue(false);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'not_started' });
    expect(hasUserReply).toHaveBeenCalledWith({ onboardingId: 1 });
  });

  it('returns in_progress when the row is open and has a user reply', async () => {
    findOnboardingRow.mockResolvedValue({
      id: 1,
      deletedAt: null,
      consentDeclinedAt: null,
      onboardingCompletedAt: null,
    });
    hasUserReply.mockResolvedValue(true);
    const result = await getOnboardingProgress({
      userId: 'user-1',
      courseSlug: 'ppl',
    });
    expect(result).toEqual({ ok: true, status: 'in_progress' });
  });
});
```

Import `getOnboardingProgress` alongside the existing `advanceOnboarding`/`closedSessionStatus`/`serialiseUpdatedAt` import from `#/lib/onboarding-session.server`.

- [ ] **Step 4: Write the route**

Create `src/routes/api/course/onboarding/status.ts`, mirroring `start.ts` exactly in shape (session check, JSON parse, zod validation, try/catch, `createFileRoute` with a `POST` handler) but calling `getOnboardingProgress` instead of `advanceOnboarding`, and mapping its `course_not_found` result to a 404:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { getOnboardingProgress } from '#/lib/onboarding-session.server';

const StatusBodySchema = z.object({ courseSlug: z.string().min(1) });

/**
 * Read-only: answers whether the logged-in user has engaged with onboarding
 * for this course at all, without running the machine or writing anything.
 * Safe to call on every course-page render — see getOnboardingProgress.
 *
 * SECURITY: userId comes from auth.api.getSession and nowhere else, same
 * rule as every other route in this directory.
 */
export async function onboardingProgressHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = StatusBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getOnboardingProgress({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
    });

    if (!result.ok) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    return Response.json({ status: result.status });
  } catch (error) {
    console.error('Failed to read onboarding status:', error);
    return Response.json(
      { error: 'Failed to read onboarding status' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/course/onboarding/status')({
  server: {
    handlers: {
      POST: ({ request }) => onboardingProgressHandler(request),
    },
  },
});
```

- [ ] **Step 5: Write the route test**

Create `src/routes/api/course/onboarding/__tests__/status.test.ts`, mirroring `start.test.ts`'s exact structure (`// @vitest-environment node`, `vi.hoisted` + `vi.mock('#/lib/auth', ...)` + `vi.mock('#/lib/onboarding-session.server', ...)`), covering: 401 when unauthenticated (and `getOnboardingProgress` not called); 200 with the status body on success; a `userId` in the request body is ignored (same property `start.test.ts` pins); 404 when `course_not_found`; 400 when `courseSlug` is missing; 400 when the body isn't JSON; 500 when `getOnboardingProgress` throws.

- [ ] **Step 6: Regenerate the route tree**

Run: `pnpm build` (not `pnpm dev`). Confirm `src/routeTree.gen.ts` now includes the new route.

- [ ] **Step 7: Verify**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm test` — no regressions, new tests passing.
Run: `pnpm exec biome check src/lib/onboarding-session.server.ts src/lib/__tests__/onboarding-session.test.ts src/routes/api/course/onboarding/status.ts src/routes/api/course/onboarding/__tests__/status.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/onboarding-session.server.ts src/lib/__tests__/onboarding-session.test.ts src/routes/api/course/onboarding/status.ts src/routes/api/course/onboarding/__tests__/status.test.ts src/routeTree.gen.ts
git status --short
git commit -m "feat(onboarding): add a read-only status route"
```

---

## Task 3: The client hook

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-onboarding-status.ts`

**Interfaces:**
- Produces: `dataKeys.onboardingProgress(courseSlug)`; `useOnboardingStatus(courseSlug: string)` — a plain `useQuery` result whose `data` is `OnboardingProgress | undefined` (not destructured/renamed inside the hook, matching `useMyCourses`'s convention of returning the query object directly).

No test — matches `use-my-courses.ts`/`use-onboarding-chat.ts`/`use-admin-courses.ts`, none of which have one.

- [ ] **Step 1: Add the query key**

In `src/data-hooks/keys.ts`, beside `onboardingSession`:

```ts
  onboardingProgress: (courseSlug: string) =>
    ['user', 'onboarding-progress', courseSlug] as const,
```

- [ ] **Step 2: Write the hook**

Create `src/data-hooks/use-onboarding-status.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const onboardingProgressSchema = z.object({
  status: z.enum([
    'not_started',
    'in_progress',
    'complete',
    'declined',
    'deleted',
  ]),
});

/** Whether the logged-in user has engaged with onboarding for this course at
 * all — a coarser question than useOnboardingChat's per-turn status, backed
 * by a read-only route with no model call, so it's safe to call on every
 * course-page render without spending anything. */
export function useOnboardingStatus(courseSlug: string) {
  return useQuery({
    queryKey: dataKeys.onboardingProgress(courseSlug),
    queryFn: async () => {
      const res = await fetch('/api/course/onboarding/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseSlug }),
      });
      if (!res.ok) {
        throw new Error(`Failed to load onboarding status (${res.status})`);
      }
      return onboardingProgressSchema.parse(await res.json()).status;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm exec biome check src/data-hooks/use-onboarding-status.ts src/data-hooks/keys.ts`.
Run: `pnpm test` — no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/data-hooks/use-onboarding-status.ts src/data-hooks/keys.ts
git status --short
git commit -m "feat(onboarding): add the onboarding status client hook"
```

---

## Task 4: Auto-open wiring, and removing the dismissible prompt

**Files:**
- Modify: `src/routes/_authed/course.$courseSlug.index.tsx`
- Modify: `src/atoms/chat-widget.ts`
- Delete: `src/components/courses/onboarding-prompt.tsx`
- Delete: `src/components/courses/__tests__/onboarding-prompt.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingStatus` (Task 3); `chatWidgetModeAtom`, `chatWidgetOpenAtom` (already exist, unchanged).

- [ ] **Step 1: Remove `onboardingPromptDismissedAtom`**

In `src/atoms/chat-widget.ts`, delete the `onboardingPromptDismissedAtom` export and its doc comment (the last ~8 lines of the file). No dismissal state is needed: per this plan's design, closing the auto-opened widget without responding does not suppress it on a later visit.

- [ ] **Step 2: Delete the prompt component and its test**

```bash
git rm src/components/courses/onboarding-prompt.tsx src/components/courses/__tests__/onboarding-prompt.test.tsx
```

- [ ] **Step 3: Rewrite the course index route**

Replace `src/routes/_authed/course.$courseSlug.index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { chatWidgetModeAtom, chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { useOnboardingStatus } from '#/data-hooks/use-onboarding-status';
import { LessonEmpty } from '../../components/lesson-main';

/**
 * Container: auto-opens the shared chat widget into onboarding mode when the
 * learner has never engaged with onboarding for this course.
 *
 * useOnboardingStatus is read-only (no model call, safe on every render); the
 * effect only fires when its `status` dependency's VALUE changes, so closing
 * the widget mid-visit without responding does not reopen it on an unrelated
 * re-render (status is still 'not_started', same value, effect doesn't
 * re-run) — but a fresh page visit (component remount) re-evaluates and
 * reopens if still 'not_started'. No dismissal state is tracked by design.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: CourseIndexContainer,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { data: status } = useOnboardingStatus(courseSlug);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const setOpen = useSetAtom(chatWidgetOpenAtom);

  useEffect(() => {
    if (status === 'not_started') {
      setMode({ kind: 'onboarding', courseSlug });
      setOpen(true);
    }
  }, [status, courseSlug, setMode, setOpen]);

  return <LessonEmpty />;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit` — zero output.
Run: `pnpm test` — no regressions, and no fewer test files than after Task 3 minus the two deleted (`onboarding-prompt.test.tsx` is gone on purpose — confirm nothing else references `OnboardingPrompt` or `onboardingPromptDismissedAtom`: `grep -rn "OnboardingPrompt\|onboardingPromptDismissedAtom" src/` should return nothing).
Run: `pnpm exec biome check src/routes/_authed/course.\$courseSlug.index.tsx src/atoms/chat-widget.ts`.
`git diff --stat src/routeTree.gen.ts` — should be empty (no route files added/removed this task; the course index route only changes contents).
`git diff --stat main..HEAD -- src/components/chat-widget/ src/machines/` — should be empty (this plan never touches either).

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/course.\$courseSlug.index.tsx src/atoms/chat-widget.ts
git status --short
git commit -m "feat(onboarding): auto-open the widget when onboarding hasn't started, remove the click-through prompt"
```

---

## Done criteria

- `pnpm test` passes with no regressions against the 111-file / 699-test baseline (net file count may drop by one: `onboarding-prompt.test.tsx` removed, `status.test.ts` added).
- `pnpm exec tsc --noEmit` reports zero output.
- `getOnboardingProgress` never calls `hasUserReply` when there's no row or the row is already closed (proven by the Task 2 tests), and never calls anything from `onboarding-runner.ts` at all (grep-provable — it isn't imported).
- `git diff --stat main..HEAD -- src/components/chat-widget/` and `-- src/machines/` are both empty.
- `grep -rn "OnboardingPrompt\|onboardingPromptDismissedAtom" src/` returns nothing.

## Explicitly out of scope

- Auto-resuming a paused mid-interview session (only `not_started` triggers auto-open).
- Any change to the machine, the three existing mutating routes (`start`/`reply`/`delete`), or any presentational chat-widget component.
- A dismissal/nag-suppression mechanism (deliberately rejected in the design spec — an additive follow-up if it proves needed in practice).
