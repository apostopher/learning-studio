# Onboarding Auto-Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the onboarding section's manual Save button with debounced auto-save + a best-effort `sendBeacon` save on close/unload, via a reusable `fireAndForget` data-hook mode.

**Architecture:** Consolidate the save verb to POST (sendBeacon is POST-only). A shared `saveJson` helper picks `navigator.sendBeacon` vs `fetch(keepalive)`. `useUpdateCourseOnboarding` gains a `{ questions, fireAndForget }` variable shape through it (still a TanStack `useMutation`). The container watches the RHF form, debounces 800 ms, and flushes a beacon save on unmount + `pagehide`; the editor shows an auto-save status instead of a button.

**Tech Stack:** React, TanStack Query, react-hook-form, dnd-kit, Base UI, zod v4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-onboarding-autosave-design.md`

## Global Constraints

- **Import alias:** tested/source files use `#/`; tests use `#/`; relative `./` fine. (memory: [[vitest-alias-and-env]])
- **HOOKLESS render-tested components / no jest-dom / `apple-9`:** the container + editor use hooks (RHF, dnd, effects) and are NOT render-tested — logic is covered by the util + hook + route tests. Tests use plain assertions, never `@testing-library/jest-dom`. `apple-9` is the real focus token. (memory: [[component-render-test-constraints]])
- **Commit discipline:** explicit `git add <paths>` only; never `git add -A`/`.`. Do not stage the user's unrelated working-state (`src/env.ts`, `src/styles.css`, `src/utils/brand-colors.*`, `scripts/generate-theme-css.*`). Each task lists exact files.
- **Run one test file:** `pnpm test <path>`. Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`. Format check: `pnpm exec biome check <files>`.

---

### Task 1: Route — consolidate the save verb to POST

**Files:**
- Modify: `src/routes/api/admin/courses.$courseId.onboarding.ts`
- Modify: `src/routes/api/admin/__tests__/course-onboarding-route.test.ts`

**Interfaces:**
- Produces: `getOnboardingHandler` (unchanged) + `postOnboardingHandler(request, courseIdRaw)` (was `putOnboardingHandler`); `Route` serves `GET` + `POST`.

- [ ] **Step 1: Update the route test (PUT → POST)**

In `src/routes/api/admin/__tests__/course-onboarding-route.test.ts`: rename the import `putOnboardingHandler` → `postOnboardingHandler`, rename `putReq` → `postReq` with `method: 'POST'`, and rename the `describe('putOnboardingHandler', …)` block to `postOnboardingHandler`, calling `postOnboardingHandler(...)` in each case. Keep every assertion identical (403 / 400 bad-json / 400 schema + `updateCourseOnboarding` not called / save-and-return). The `postReq` helper:

```ts
function postReq(body: unknown): Request {
  return new Request('http://test/api/admin/courses/1/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/admin/__tests__/course-onboarding-route.test.ts`
Expected: FAIL — `postOnboardingHandler` not exported.

- [ ] **Step 3: Rename the handler + swap PUT→POST in the route**

In `src/routes/api/admin/courses.$courseId.onboarding.ts`: rename `putOnboardingHandler` to `postOnboardingHandler` (body unchanged), and change the `Route` handlers so `POST` replaces `PUT`:

```ts
export const Route = createFileRoute('/api/admin/courses/$courseId/onboarding')(
  {
    server: {
      handlers: {
        GET: ({ request, params }) =>
          getOnboardingHandler(request, params.courseId),
        POST: ({ request, params }) =>
          postOnboardingHandler(request, params.courseId),
      },
    },
  },
);
```

- [ ] **Step 4: Run test + typecheck + regenerate route tree**

Run: `pnpm test src/routes/api/admin/__tests__/course-onboarding-route.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "onboarding" || echo clean` → `clean`. If `routeTree.gen.ts` needs updating for the method change, it regenerates automatically when `pnpm test`/dev boots the plugin; commit it separately if it changes.

- [ ] **Step 5: Full suite + commit**

Run: `pnpm test` → no regressions.

```bash
git add src/routes/api/admin/courses.$courseId.onboarding.ts src/routes/api/admin/__tests__/course-onboarding-route.test.ts
git commit -m "refactor(api): onboarding save uses POST (for sendBeacon support)"
```

(If `routeTree.gen.ts` changed: `git add src/routeTree.gen.ts && git commit -m "chore: regenerate route tree"`.)

---

### Task 2: `saveJson` request helper

**Files:**
- Create: `src/data-hooks/save-json.ts`
- Test: `src/data-hooks/__tests__/save-json.test.ts`

**Interfaces:**
- Produces: `saveJson<T>(args: SaveJsonArgs<T>): Promise<T | undefined>`, `SaveJsonArgs<T>`.

- [ ] **Step 1: Write the failing test**

Create `src/data-hooks/__tests__/save-json.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveJson } from '#/data-hooks/save-json';

afterEach(() => vi.restoreAllMocks());

describe('saveJson', () => {
  it('uses sendBeacon for fire-and-forget POST when available', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveJson({
      url: '/x',
      method: 'POST',
      body: { a: 1 },
      fireAndForget: true,
    });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/x');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });

  it('falls back to keepalive fetch when sendBeacon is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await saveJson({ url: '/x', method: 'POST', body: {}, fireAndForget: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
  });

  it('normal save fetches (no keepalive) and parses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ v: 2 }) });
    vi.stubGlobal('fetch', fetchMock);

    const out = await saveJson<{ v: number }>({
      url: '/x',
      method: 'POST',
      body: {},
      parse: (j) => j as { v: number },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.keepalive).toBe(false);
    expect(out).toEqual({ v: 2 });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(
      saveJson({ url: '/x', method: 'POST', body: {} }),
    ).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data-hooks/__tests__/save-json.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `src/data-hooks/save-json.ts`:

```ts
export interface SaveJsonArgs<T> {
  url: string;
  method: 'POST' | 'PUT';
  body: unknown;
  /** Best-effort save that must survive page unload (uses sendBeacon/keepalive). */
  fireAndForget?: boolean;
  parse?: (json: unknown) => T;
}

/**
 * Save JSON to `url`. For a fire-and-forget POST, prefers `navigator.sendBeacon`
 * (the only reliable way to send during unload), falling back to a `keepalive`
 * fetch. The beacon path resolves `undefined` (there is no response to read).
 * Normal saves fetch and (optionally) parse the response.
 */
export async function saveJson<T>({
  url,
  method,
  body,
  fireAndForget = false,
  parse,
}: SaveJsonArgs<T>): Promise<T | undefined> {
  if (
    fireAndForget &&
    method === 'POST' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    const blob = new Blob([JSON.stringify(body)], {
      type: 'application/json',
    });
    if (navigator.sendBeacon(url, blob)) return undefined;
    // Beacon rejected (e.g. queue full) — fall through to a keepalive fetch.
  }

  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: fireAndForget,
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return parse ? parse(await res.json()) : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/data-hooks/__tests__/save-json.test.ts` → PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/data-hooks/save-json.ts src/data-hooks/__tests__/save-json.test.ts
git commit -m "feat(data): saveJson helper (sendBeacon or keepalive fetch)"
```

---

### Task 3: Update-hook — POST + fireAndForget via `saveJson`

**Files:**
- Modify: `src/data-hooks/use-update-course-onboarding.ts`
- Modify: `src/data-hooks/__tests__/use-update-course-onboarding.test.tsx`

**Interfaces:**
- Consumes: `saveJson`.
- Produces: `useUpdateCourseOnboarding(courseId)` mutation with variables `{ questions: OnboardingQuestion[]; fireAndForget?: boolean }`.

- [ ] **Step 1: Update the hook test**

Rewrite `src/data-hooks/__tests__/use-update-course-onboarding.test.tsx` so it (a) calls `mutate({ questions })` and asserts a POST fetch, and (b) adds a fire-and-forget case asserting `sendBeacon`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useUpdateCourseOnboarding', () => {
  it('POSTs the questions and returns saved (normal mode)', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => questions });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    result.current.mutate({ questions });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/courses/4/onboarding');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ questions });
    expect(result.current.data).toEqual(questions);
  });

  it('uses sendBeacon in fire-and-forget mode', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    result.current.mutate({ questions, fireAndForget: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('/api/admin/courses/4/onboarding');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(questions); // echoed optimistically
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/data-hooks/__tests__/use-update-course-onboarding.test.tsx`
Expected: FAIL — variables shape / behavior mismatch.

- [ ] **Step 3: Rewrite the hook**

Replace `src/data-hooks/use-update-course-onboarding.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';
import { saveJson } from './save-json';

interface UpdateOnboardingVars {
  questions: OnboardingQuestion[];
  /** Save-on-close: prefer sendBeacon and don't await a response. */
  fireAndForget?: boolean;
}

/**
 * Save (full-replace) a course's onboarding questions via POST, then refresh
 * the cache. In `fireAndForget` mode the save goes out via sendBeacon and the
 * input is echoed (no response to parse) — used for save-on-close.
 */
export function useUpdateCourseOnboarding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      questions,
      fireAndForget,
    }: UpdateOnboardingVars): Promise<OnboardingQuestion[]> => {
      const saved = await saveJson({
        url: `/api/admin/courses/${courseId}/onboarding`,
        method: 'POST',
        body: { questions },
        fireAndForget,
        parse: (json) => OnboardingQuestionsSchema.parse(json),
      });
      return saved ?? questions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseOnboarding(courseId),
      });
    },
  });
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/data-hooks/__tests__/use-update-course-onboarding.test.tsx` → PASS.
Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "use-update-course-onboarding|save-json" || echo clean` → `clean`.
(Note: the container in Task 4 consumes the new variable shape; a full-project tsc may report an error in `course-onboarding-container.tsx` until Task 4 lands — that is expected and resolved there. Scope the grep as shown.)

- [ ] **Step 5: Commit**

```bash
git add src/data-hooks/use-update-course-onboarding.ts src/data-hooks/__tests__/use-update-course-onboarding.test.tsx
git commit -m "feat(data): onboarding update-hook POST + fireAndForget mode"
```

---

### Task 4: Auto-save container + status editor

**Files:**
- Modify: `src/components/admin/onboarding-questions-editor.tsx`
- Modify: `src/components/admin/course-onboarding-container.tsx`

**Interfaces:**
- Editor produces: `OnboardingSaveStatus = 'saving' | 'saved' | 'unsaved' | 'error'`; props drop `isSaving`/`isDirty`/`onSave`, add `status: OnboardingSaveStatus`, `onRetry: () => void`.

- [ ] **Step 1: Update the editor — replace Save button with a status line**

In `src/components/admin/onboarding-questions-editor.tsx`:
1. Change the lucide import to add `Check`: `import { Check, Loader2, Plus } from 'lucide-react';`
2. Export the status type and swap the props:

```ts
export type OnboardingSaveStatus = 'saving' | 'saved' | 'unsaved' | 'error';

interface OnboardingQuestionsEditorProps {
  fields: { key: string; id: string }[];
  register: UseFormRegister<OnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  status: OnboardingSaveStatus;
  onRetry: () => void;
}
```

3. Update the destructured props (`status`, `onRetry` instead of `isSaving`, `isDirty`, `onSave`).
4. Replace the entire bottom `<div className="flex items-center justify-between">…</div>` (the Add + Save row) with:

```tsx
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-gray-12 text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add question
        </button>

        {status === 'saving' ? (
          <span className="flex items-center gap-1.5 text-gray-10 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        ) : status === 'error' ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-red-11">Couldn’t save.</span>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md px-2 py-1 font-medium text-gray-12 text-xs hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              Retry
            </button>
          </span>
        ) : status === 'unsaved' ? (
          <span className="text-gray-10 text-sm">Unsaved changes…</span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-10 text-sm">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            All changes saved
          </span>
        )}
      </div>
```

Update the component doc comment to "…drag-reorder rows, add, and auto-save."

- [ ] **Step 2: Rewrite the container with auto-save**

Replace `src/components/admin/course-onboarding-container.tsx`:

```tsx
import type { DragEndEvent } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';
import type { OnboardingQuestion } from '#/types';
import { createEmptyQuestion } from './onboarding-helpers';
import {
  type OnboardingSaveStatus,
  OnboardingQuestionsEditor,
} from './onboarding-questions-editor';

const DEBOUNCE_MS = 800;

interface OnboardingFormValues {
  questions: OnboardingQuestion[];
}

/** Container: authors a course's onboarding questions with auto-save. Not render-tested. */
export const CourseOnboardingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const query = useCourseOnboarding(courseId);
  const update = useUpdateCourseOnboarding(courseId);

  // Seed once (defaultValues, not `values`) so refetches never clobber edits.
  const form = useForm<OnboardingFormValues>({
    defaultValues: { questions: [] },
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'questions',
    keyName: 'key',
  });

  const seededRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const currentRef = useRef<OnboardingQuestion[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRef = useRef(update);
  updateRef.current = update;

  // Seed the form + baselines the first time the query resolves.
  useEffect(() => {
    if (!seededRef.current && query.data) {
      seededRef.current = true;
      form.reset({ questions: query.data });
      currentRef.current = query.data;
      lastSavedRef.current = JSON.stringify(query.data);
    }
  }, [query.data, form]);

  // Debounced auto-save on any form change.
  useEffect(() => {
    const sub = form.watch((value) => {
      const questions = (value.questions ?? []) as OnboardingQuestion[];
      currentRef.current = questions;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const snapshot = JSON.stringify(questions);
        if (snapshot === lastSavedRef.current) return;
        updateRef.current.mutate(
          { questions },
          {
            onSuccess: () => {
              lastSavedRef.current = snapshot;
            },
          },
        );
      }, DEBOUNCE_MS);
    });
    return () => sub.unsubscribe();
  }, [form]);

  // Flush a best-effort save on unmount (dialog close / tab switch) and pagehide.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const questions = currentRef.current;
      const snapshot = JSON.stringify(questions);
      if (snapshot === lastSavedRef.current) return;
      lastSavedRef.current = snapshot;
      updateRef.current.mutate({ questions, fireAndForget: true });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  const dirty =
    JSON.stringify(form.watch('questions')) !== lastSavedRef.current;
  const status: OnboardingSaveStatus = update.isPending
    ? 'saving'
    : update.isError
      ? 'error'
      : dirty
        ? 'unsaved'
        : 'saved';

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2
          className="h-5 w-5 animate-spin text-gray-10"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <OnboardingQuestionsEditor
      fields={fields}
      register={form.register}
      onAdd={() => append(createEmptyQuestion())}
      onRemove={remove}
      onDragEnd={onDragEnd}
      status={status}
      onRetry={() => update.mutate({ questions: form.getValues('questions') })}
    />
  );
};
```

- [ ] **Step 3: Typecheck + full suite + format/lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "course-onboarding-container|onboarding-questions-editor" || echo clean` → `clean`.
Run: `pnpm test` → all pass (no new render tests; the container/editor are not render-tested).
Run: `pnpm exec biome check src/components/admin/course-onboarding-container.tsx src/components/admin/onboarding-questions-editor.tsx` → 0 errors (run `biome check --write` if it only needs formatting).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/onboarding-questions-editor.tsx src/components/admin/course-onboarding-container.tsx
git commit -m "feat(admin): auto-save onboarding questions (debounce + beacon on close)"
```

---

## Notes for the implementer

- **`sendBeacon` timing caveat:** the container fires the beacon via `update.mutate({ fireAndForget: true })`. On dialog-close / tab-away (component unmount, page not unloading) the async mutation runs fine. On a hard `pagehide` (window/tab close) the async hop *may* occasionally miss the unload; this is best-effort by design. If bulletproof unload saving is later required, call `saveJson({ fireAndForget: true })` synchronously in the `pagehide` handler instead.
- **No form clobber:** the container seeds via `defaultValues` + a one-time `form.reset`, NOT `useForm({ values })` — so the post-save `invalidate → refetch` can't overwrite in-progress edits.
- **Refs, not state:** `currentRef`/`lastSavedRef`/`updateRef` keep the unmount/pagehide handlers reading the latest values without re-subscribing; status derives from `update` + a live `form.watch` compare (no `useState`).
- **Hookless/no-render-test:** the container + editor use hooks (effects, dnd) so they aren't render-tested; correctness is covered by `save-json`, the hook test, and the route test, plus a live browser check (add a question → see "Saving…" → "All changes saved"; close the dialog → row persists on reopen). (memory: [[component-render-test-constraints]])
- **`apple-9`** focus token and the `red-11` error text are the established tokens. Auto-save saves blank questions too (by spec) — the ≤2000/≤50 bounds from the prior feature still apply.
