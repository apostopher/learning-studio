# Course Onboarding Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Onboarding" section to the edit-course dialog where an admin authors a course's ordered, drag-reorderable, plain-text onboarding questions, persisted to a JSONB column via an own Save button.

**Architecture:** JSONB `onboarding_questions` column on `courses`; a guarded `GET`/`PUT` sub-route; TanStack Query hooks; an independent section container (react-hook-form `useFieldArray` + dnd-kit) rendered as a third `SectionedConfigModal` section — mirroring the Video-providers section.

**Tech Stack:** React, TanStack Router/Query, Base UI, react-hook-form + `@hookform/resolvers/zod`, zod v4, dnd-kit (`@dnd-kit/core`/`sortable`/`utilities`), Drizzle + Postgres (jsonb), lucide-react, sonner, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-course-onboarding-questions-design.md`

## Global Constraints

- **Import alias:** any source file a test imports (directly/transitively) uses `#/`; tests use `#/`; relative `./` always fine; untested files may keep sibling `@/`. (memory: [[vitest-alias-and-env]])
- **HOOKLESS presentational components** (hard infra constraint): this repo's react-compiler+Vitest pipeline nulls the React hook dispatcher for our `src/` components that call a hook directly in a render test. Components that use dnd-kit hooks (`useSortable`) or RHF are therefore NOT render-tested; the container (hooks) is NOT render-tested. Extract any testable logic into pure functions and unit-test those. (memory: [[component-render-test-constraints]])
- **No `@testing-library/jest-dom`** — use plain assertions (`queryByText(...).toBeNull()/not.toBeNull()`, `(el as HTMLButtonElement).disabled`, `el.getAttribute(...)`). (memory: [[component-render-test-constraints]])
- **Tokens/CSS:** gray/red radix + `apple-9` (the real brand-accent focus token). Logical CSS / Tailwind logical variants (`ps-*`, `start-*`) — never physical, and never the raw property name as a class (e.g. `start-3`, NOT `inset-inline-start-3`).
- **Commit discipline:** explicit `git add <paths>` only, never `git add -A`/`.`. Do not stage the user's unrelated working-state (`src/env.ts`, `src/styles.css`, `src/utils/brand-colors.*`, `scripts/generate-theme-css.*`). Each task lists exact files.
- **Run one test file:** `pnpm test <path>`. Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`.

---

### Task 1: Schema — types + `onboarding_questions` column

**Files:**
- Modify: `src/types.ts`
- Modify: `src/db/schema.ts` (the `coursesTable` definition + its `@/types` import)
- Test: `src/__tests__/onboarding-questions-schema.test.ts`

**Interfaces:**
- Produces: `OnboardingQuestionSchema`, `OnboardingQuestionsSchema` (`z.array`), types `OnboardingQuestion`, `OnboardingQuestions`; `coursesTable.onboardingQuestions` jsonb column.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/onboarding-questions-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OnboardingQuestionsSchema } from '#/types';

describe('OnboardingQuestionsSchema', () => {
  it('accepts an array of {id, text}', () => {
    const r = OnboardingQuestionsSchema.safeParse([
      { id: 'a', text: 'What is your callsign?' },
      { id: 'b', text: '' },
    ]);
    expect(r.success).toBe(true);
  });
  it('accepts an empty array', () => {
    expect(OnboardingQuestionsSchema.safeParse([]).success).toBe(true);
  });
  it('rejects a missing id', () => {
    expect(
      OnboardingQuestionsSchema.safeParse([{ text: 'x' }]).success,
    ).toBe(false);
  });
  it('rejects a non-array', () => {
    expect(OnboardingQuestionsSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/onboarding-questions-schema.test.ts`
Expected: FAIL — `OnboardingQuestionsSchema` not exported.

- [ ] **Step 3: Add the schema to `src/types.ts`**

Append near the other schema exports in `src/types.ts`:

```ts
export const OnboardingQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});
export type OnboardingQuestion = z.infer<typeof OnboardingQuestionSchema>;
export const OnboardingQuestionsSchema = z.array(OnboardingQuestionSchema);
export type OnboardingQuestions = z.infer<typeof OnboardingQuestionsSchema>;
```

(`z` is already imported in `src/types.ts`.)

- [ ] **Step 4: Add the column to `coursesTable`**

In `src/db/schema.ts`, add `OnboardingQuestionsSchema` to the existing `@/types` import block, then add the column to `coursesTable` (after `imageUrlWebp`):

```ts
  onboardingQuestions: jsonb("onboarding_questions")
    .$type<z.infer<typeof OnboardingQuestionsSchema>>()
    .notNull()
    .default([]),
```

(`jsonb` is already imported in `schema.ts`.)

- [ ] **Step 5: Apply to the database**

Run: `pnpm db:push`
Expected: `[✓] Changes applied` (adding a NOT NULL column with a `default` is safe on existing rows). If a non-TTY prompt blocks it, apply directly:

```bash
DBURL=$(grep -h '^DATABASE_URL' .env.local .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
psql "$DBURL" -v ON_ERROR_STOP=1 -c "ALTER TABLE courses ADD COLUMN onboarding_questions jsonb NOT NULL DEFAULT '[]'::jsonb;"
```

Then verify: `psql "$DBURL" -c "\d courses" | grep onboarding_questions` → shows `jsonb NOT NULL default`.

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm test src/__tests__/onboarding-questions-schema.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "types.ts|schema.ts" || echo clean` → `clean`.

- [ ] **Step 7: Commit** (schema.ts is normally user working-state, but here the column is part of THIS feature; commit only these three files)

```bash
git add src/types.ts src/db/schema.ts src/__tests__/onboarding-questions-schema.test.ts
git commit -m "feat(db): onboarding_questions jsonb column + zod schema"
```

If `git status` shows other pre-existing `schema.ts` edits you did not make this task, STOP and ask — do not sweep them in.

---

### Task 2: DB fns + guarded GET/PUT route

**Files:**
- Modify: `src/db/admin.ts`
- Create: `src/routes/api/admin/courses.$courseId.onboarding.ts`
- Test: `src/routes/api/admin/__tests__/course-onboarding-route.test.ts`

**Interfaces:**
- Consumes: `OnboardingQuestionsSchema`, `OnboardingQuestion` from `#/types`; `requireAdmin`/`ForbiddenError`.
- Produces:
  - `getCourseOnboarding(courseId: number): Promise<OnboardingQuestion[]>`
  - `updateCourseOnboarding(courseId: number, questions: OnboardingQuestion[]): Promise<OnboardingQuestion[]>`
  - Route `/api/admin/courses/$courseId/onboarding` with exported handlers `getOnboardingHandler(request, courseIdRaw)`, `putOnboardingHandler(request, courseIdRaw)`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/api/admin/__tests__/course-onboarding-route.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    getCourseOnboarding: vi.fn(),
    updateCourseOnboarding: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/admin', () => ({
  getCourseOnboarding: m.getCourseOnboarding,
  updateCourseOnboarding: m.updateCourseOnboarding,
}));

import {
  getOnboardingHandler,
  putOnboardingHandler,
} from '../courses.$courseId.onboarding';

function putReq(body: unknown): Request {
  return new Request('http://test/api/admin/courses/1/onboarding', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
});

describe('getOnboardingHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(403);
  });
  it('400 on invalid course id', async () => {
    const res = await getOnboardingHandler(new Request('http://t'), 'abc');
    expect(res.status).toBe(400);
  });
  it('returns the questions', async () => {
    m.getCourseOnboarding.mockResolvedValue([{ id: 'a', text: 'Q1' }]);
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'a', text: 'Q1' }]);
    expect(m.getCourseOnboarding).toHaveBeenCalledWith(1);
  });
});

describe('putOnboardingHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putOnboardingHandler(putReq({ questions: [] }), '1');
    expect(res.status).toBe(403);
  });
  it('400 on bad JSON', async () => {
    const bad = new Request('http://t', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect((await putOnboardingHandler(bad, '1')).status).toBe(400);
  });
  it('400 on schema failure', async () => {
    const res = await putOnboardingHandler(putReq({ questions: [{ text: 'x' }] }), '1');
    expect(res.status).toBe(400);
    expect(m.updateCourseOnboarding).not.toHaveBeenCalled();
  });
  it('saves and returns the questions', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    m.updateCourseOnboarding.mockResolvedValue(questions);
    const res = await putOnboardingHandler(putReq({ questions }), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(questions);
    expect(m.updateCourseOnboarding).toHaveBeenCalledWith(1, questions);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/admin/__tests__/course-onboarding-route.test.ts`
Expected: FAIL — cannot resolve `../courses.$courseId.onboarding`.

- [ ] **Step 3: Add the DB fns**

In `src/db/admin.ts`, add (import `OnboardingQuestion` from `#/types` and ensure `coursesTable`, `db`, `eq` are imported — they already are):

```ts
export async function getCourseOnboarding(
  courseId: number,
): Promise<OnboardingQuestion[]> {
  const [row] = await db
    .select({ onboardingQuestions: coursesTable.onboardingQuestions })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  return row?.onboardingQuestions ?? [];
}

export async function updateCourseOnboarding(
  courseId: number,
  questions: OnboardingQuestion[],
): Promise<OnboardingQuestion[]> {
  await db
    .update(coursesTable)
    .set({ onboardingQuestions: questions, updatedAt: new Date() })
    .where(eq(coursesTable.id, courseId));
  return questions;
}
```

If `src/db/admin.ts` imports types from `@/types`, add `OnboardingQuestion` to that import (this file is not test-imported directly here — the route test mocks `#/db/admin` — so its own alias may stay `@/`).

- [ ] **Step 4: Create the route**

Create `src/routes/api/admin/courses.$courseId.onboarding.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import {
  getCourseOnboarding,
  updateCourseOnboarding,
} from '#/db/admin';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { OnboardingQuestionsSchema } from '#/types';

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getOnboardingHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  return Response.json(await getCourseOnboarding(courseId));
}

export async function putOnboardingHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = OnboardingQuestionsSchema.safeParse(
    (body as { questions?: unknown })?.questions,
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(
    await updateCourseOnboarding(courseId, parsed.data),
  );
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/onboarding',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getOnboardingHandler(request, params.courseId),
      PUT: ({ request, params }) =>
        putOnboardingHandler(request, params.courseId),
    },
  },
});
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm test src/routes/api/admin/__tests__/course-onboarding-route.test.ts` → PASS (all cases). If a route-tree typecheck error appears for the new `createFileRoute`, regenerate the tree (`pnpm exec tsr generate` or start `pnpm dev` briefly); the handler test imports handlers directly and doesn't need it.
Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "onboarding|db/admin" || echo clean` → `clean`.

- [ ] **Step 6: Full suite + commit**

Run: `pnpm test` → no regressions.

```bash
git add src/db/admin.ts src/routes/api/admin/courses.$courseId.onboarding.ts src/routes/api/admin/__tests__/course-onboarding-route.test.ts
git commit -m "feat(api): guarded GET/PUT course onboarding-questions route"
```

(If `routeTree.gen.ts` was regenerated, commit it separately: `git add src/routeTree.gen.ts && git commit -m "chore: regenerate route tree for onboarding route"`.)

---

### Task 3: Data-hooks + query key

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-course-onboarding.ts`
- Create: `src/data-hooks/use-update-course-onboarding.ts`
- Test: `src/data-hooks/__tests__/use-course-onboarding.test.tsx`
- Test: `src/data-hooks/__tests__/use-update-course-onboarding.test.tsx`

**Interfaces:**
- Produces:
  - `dataKeys.courseOnboarding(courseId)`
  - `useCourseOnboarding(courseId)` → `UseQueryResult<OnboardingQuestion[]>`
  - `useUpdateCourseOnboarding(courseId)` → mutation `OnboardingQuestion[] → OnboardingQuestion[]`

- [ ] **Step 1: Add the key**

In `src/data-hooks/keys.ts`, add inside `dataKeys`:

```ts
  courseOnboarding: (courseId: number) =>
    ['admin', 'course-onboarding', courseId] as const,
```

- [ ] **Step 2: Write the failing tests**

Create `src/data-hooks/__tests__/use-course-onboarding.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useCourseOnboarding', () => {
  it('fetches the course onboarding questions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a', text: 'Q1' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/4/onboarding');
    expect(result.current.data).toEqual([{ id: 'a', text: 'Q1' }]);
  });
});
```

Create `src/data-hooks/__tests__/use-update-course-onboarding.test.tsx`:

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
  it('PUTs the questions and returns saved', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => questions,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateCourseOnboarding(4), {
      wrapper: wrapper(),
    });
    result.current.mutate(questions);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/courses/4/onboarding');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ questions });
    expect(result.current.data).toEqual(questions);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/data-hooks/__tests__/use-course-onboarding.test.tsx src/data-hooks/__tests__/use-update-course-onboarding.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create the hooks**

`src/data-hooks/use-course-onboarding.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';

/** A course's onboarding questions (ordered). */
export function useCourseOnboarding(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseOnboarding(courseId),
    queryFn: async (): Promise<OnboardingQuestion[]> => {
      const res = await fetch(`/api/admin/courses/${courseId}/onboarding`);
      if (!res.ok) {
        throw new Error(`Failed to load onboarding (${res.status})`);
      }
      return OnboardingQuestionsSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
```

`src/data-hooks/use-update-course-onboarding.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type OnboardingQuestion, OnboardingQuestionsSchema } from '#/types';
import { dataKeys } from './keys';

/** Replace a course's onboarding questions, then refetch. */
export function useUpdateCourseOnboarding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      questions: OnboardingQuestion[],
    ): Promise<OnboardingQuestion[]> => {
      const res = await fetch(`/api/admin/courses/${courseId}/onboarding`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      if (!res.ok) throw new Error(`Failed to save onboarding (${res.status})`);
      return OnboardingQuestionsSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseOnboarding(courseId),
      });
    },
  });
}
```

- [ ] **Step 5: Run tests + typecheck + commit**

Run: `pnpm test src/data-hooks/__tests__/use-course-onboarding.test.tsx src/data-hooks/__tests__/use-update-course-onboarding.test.tsx` → PASS.
Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "use-course-onboarding|use-update-course-onboarding|keys.ts" || echo clean` → `clean`.

```bash
git add src/data-hooks/keys.ts src/data-hooks/use-course-onboarding.ts src/data-hooks/use-update-course-onboarding.ts src/data-hooks/__tests__/use-course-onboarding.test.tsx src/data-hooks/__tests__/use-update-course-onboarding.test.tsx
git commit -m "feat(data): hooks for course onboarding questions (get/update)"
```

---

### Task 4: Presentational — auto-textarea, sortable row, editor + pure helper

**Files:**
- Create: `src/components/admin/auto-grow-textarea.tsx`
- Create: `src/components/admin/onboarding-helpers.ts`
- Create: `src/components/admin/sortable-onboarding-question.tsx`
- Create: `src/components/admin/onboarding-questions-editor.tsx`
- Test: `src/components/admin/__tests__/onboarding-helpers.test.ts`

**Interfaces:**
- Produces:
  - `AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>)` — hookless auto-growing textarea.
  - `createEmptyQuestion(): { id: string; text: string }` (pure; tested).
  - `SortableOnboardingQuestion({ id, index, register, onRemove })` — one draggable row (uses `useSortable`; NOT render-tested).
  - `OnboardingQuestionsEditor({ fields, register, onAdd, onRemove, onDragEnd, sensors, isSaving, isDirty, onSave })` — the list + Add + Save shell (uses dnd-kit `SortableContext`; NOT render-tested).

- [ ] **Step 1: Write the failing helper test**

Create `src/components/admin/__tests__/onboarding-helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyQuestion } from '#/components/admin/onboarding-helpers';

describe('createEmptyQuestion', () => {
  it('makes a question with a non-empty id and empty text', () => {
    const q = createEmptyQuestion();
    expect(typeof q.id).toBe('string');
    expect(q.id.length).toBeGreaterThan(0);
    expect(q.text).toBe('');
  });
  it('makes a unique id each call', () => {
    expect(createEmptyQuestion().id).not.toBe(createEmptyQuestion().id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/admin/__tests__/onboarding-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

`src/components/admin/onboarding-helpers.ts`:

```ts
import type { OnboardingQuestion } from '#/types';

/** A new blank onboarding question with a stable unique id. */
export function createEmptyQuestion(): OnboardingQuestion {
  return { id: crypto.randomUUID(), text: '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/admin/__tests__/onboarding-helpers.test.ts` → PASS.

- [ ] **Step 5: Create the auto-grow textarea**

`src/components/admin/auto-grow-textarea.tsx`:

```tsx
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Textarea that grows with its content via CSS `field-sizing: content`.
 * Hookless presentational input. (Base UI has no auto-grow textarea primitive.)
 */
export const AutoGrowTextarea = ({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    rows={1}
    {...props}
    className={cn(
      'field-sizing-content min-h-9 w-full resize-none rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
      className,
    )}
  />
);
```

(If Tailwind doesn't emit `field-sizing-content` in this setup, use the arbitrary property `[field-sizing:content]` instead — verify by typing a long value in Step 8's manual check.)

- [ ] **Step 6: Create the sortable row**

`src/components/admin/sortable-onboarding-question.tsx`:

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { AutoGrowTextarea } from './auto-grow-textarea';

interface SortableOnboardingQuestionProps {
  id: string;
  index: number;
  register: UseFormRegisterReturn;
  onRemove: () => void;
}

/** One draggable onboarding-question row. Uses dnd-kit's useSortable. */
export const SortableOnboardingQuestion = ({
  id,
  index,
  register,
  onRemove,
}: SortableOnboardingQuestionProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        aria-label={`Reorder question ${index + 1}`}
        className="mt-1.5 cursor-grab rounded-md p-1 text-gray-10 hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <AutoGrowTextarea
        {...register}
        placeholder="Enter an onboarding question"
        aria-label={`Onboarding question ${index + 1}`}
      />
      <button
        type="button"
        aria-label={`Remove question ${index + 1}`}
        onClick={onRemove}
        className="mt-1.5 rounded-md p-1 text-gray-10 transition-colors hover:bg-red-9/15 hover:text-red-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
```

- [ ] **Step 7: Create the editor shell**

`src/components/admin/onboarding-questions-editor.tsx`:

```tsx
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Loader2, Plus } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { SortableOnboardingQuestion } from './sortable-onboarding-question';

interface OnboardingFormValues {
  questions: { id: string; text: string }[];
}

interface OnboardingQuestionsEditorProps {
  fields: { key: string; id: string }[];
  register: UseFormRegister<OnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
}

/** Onboarding questions list: drag-reorder rows, add, and save. */
export const OnboardingQuestionsEditor = ({
  fields,
  register,
  onAdd,
  onRemove,
  onDragEnd,
  isSaving,
  isDirty,
  onSave,
}: OnboardingQuestionsEditorProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-gray-11 text-sm">
        Questions shown to users when they start this course. Drag to reorder.
      </p>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-gray-6 border-dashed py-8 text-center text-gray-10 text-sm">
          No onboarding questions yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <SortableOnboardingQuestion
                  key={field.key}
                  id={field.id}
                  index={index}
                  register={register(`questions.${index}.text`)}
                  onRemove={() => onRemove(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-gray-12 text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add question
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-3 px-4 py-2 font-medium text-gray-12 transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "onboarding|auto-grow-textarea" || echo clean` → `clean`.
Run: `pnpm test` → no regressions.

```bash
git add src/components/admin/auto-grow-textarea.tsx src/components/admin/onboarding-helpers.ts src/components/admin/sortable-onboarding-question.tsx src/components/admin/onboarding-questions-editor.tsx src/components/admin/__tests__/onboarding-helpers.test.ts
git commit -m "feat(admin): onboarding questions editor (auto-grow textarea + dnd rows)"
```

---

### Task 5: Container + edit-course section wiring

**Files:**
- Create: `src/components/admin/course-onboarding-container.tsx`
- Modify: `src/components/admin/edit-course-dialog-container.tsx`

**Interfaces:**
- Consumes: `useCourseOnboarding`, `useUpdateCourseOnboarding`; `OnboardingQuestionsEditor`; `createEmptyQuestion`; `OnboardingQuestion` from `#/types`.
- Produces: `CourseOnboardingContainer({ courseId })`; a third section in the edit-course dialog.

- [ ] **Step 1: Create the container**

`src/components/admin/course-onboarding-container.tsx`:

```tsx
import type { DragEndEvent } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';
import type { OnboardingQuestion } from '#/types';
import { createEmptyQuestion } from './onboarding-helpers';
import { OnboardingQuestionsEditor } from './onboarding-questions-editor';

interface OnboardingFormValues {
  questions: OnboardingQuestion[];
}

/** Container: authors a course's onboarding questions. Not render-tested. */
export const CourseOnboardingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const query = useCourseOnboarding(courseId);
  const update = useUpdateCourseOnboarding(courseId);

  const form = useForm<OnboardingFormValues>({
    values: { questions: query.data ?? [] },
  });
  // keyName 'key' so RHF's field key never collides with our own `id`.
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'questions',
    keyName: 'key',
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  const onSave = form.handleSubmit((values) => {
    update.mutate(values.questions, {
      onSuccess: () => {
        toast.success('Onboarding questions saved');
        form.reset(values); // clear dirty state
      },
      onError: () => toast.error('Could not save. Please try again.'),
    });
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-10" aria-hidden="true" />
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
      isSaving={update.isPending}
      isDirty={form.formState.isDirty}
      onSave={onSave}
    />
  );
};
```

- [ ] **Step 2: Wire the section into the edit-course dialog**

In `src/components/admin/edit-course-dialog-container.tsx`, import the container and add a third `sections` entry after the `video` section:

```tsx
import { CourseOnboardingContainer } from './course-onboarding-container';
```

```tsx
    {
      value: 'onboarding',
      title: 'Onboarding',
      content: target && <CourseOnboardingContainer courseId={target.id} />,
    },
```

- [ ] **Step 3: Typecheck + full suite + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "course-onboarding-container|edit-course-dialog" || echo clean` → `clean`.
Run: `pnpm test` → all pass.
Run: `pnpm exec biome lint src/components/admin/course-onboarding-container.tsx src/components/admin/onboarding-questions-editor.tsx src/components/admin/sortable-onboarding-question.tsx src/components/admin/auto-grow-textarea.tsx src/components/admin/onboarding-helpers.ts src/components/admin/edit-course-dialog-container.tsx` → 0 errors/warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/course-onboarding-container.tsx src/components/admin/edit-course-dialog-container.tsx
git commit -m "feat(admin): wire Onboarding section into the edit-course dialog"
```

---

## Notes for the implementer

- **HOOKLESS + no jest-dom + `apple-9`** — see Global Constraints; the dnd/RHF pieces here are deliberately not render-tested, and `field-sizing-content` gives the auto-grow with no JS. (memory: [[component-render-test-constraints]])
- **`keyName: 'key'`** on `useFieldArray` avoids a collision between RHF's field key and our data `id`; dnd + `SortableContext` use our `id` (`field.id`), React keys use `field.key`. On submit, `values.questions` carries `{ id, text }`.
- **`form.reset(values)` after save** clears the dirty flag so the Save button disables until the next edit.
- **`db:push` for the new column** — adding a NOT NULL jsonb column WITH a default is safe on existing `courses` rows; direct-DDL fallback is in Task 1 Step 5.
- The `/api/admin/courses/$courseId/...` guarded sub-route pattern, `SectionedConfigModal` sections, and dnd-kit reorder already exist (credentials route, video section, module/lesson boards) — this plan follows them.
