# Lesson Config Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the lesson-config modal to three tabs (Video · Material · Config) and make the Config tab's Availability / Access / Debrief toggles persist for real.

**Architecture:** Thread two existing lesson columns (`has_debrief`, `required_subscriptions`) plus the parent module's `required_subscriptions` through the course-board query and schemas. Extend the lesson `PATCH` endpoint with a config branch and a strict input schema. Build three presentational pieces (a `BinaryToggle` over Base UI `ToggleGroup`, a `ConfigSettingRow`, and pure mapping helpers) and a `ConfigSectionContainer` that wires each toggle to an optimistic `useUpdateLessonConfig` mutation. No database migration — all three columns already exist.

**Tech Stack:** TanStack Router file routes, TanStack Query, Drizzle ORM, Base UI (`@base-ui/react` 1.4.1), Zod, Tailwind, Vitest + Testing Library, sonner (toasts).

## Global Constraints

- TypeScript strict mode; presentational components are pure and stateless; containers own state/data.
- Base UI components first; kebab-case filenames, PascalCase exports.
- CSS logical properties only (`ms-*`/`me-*`, `border-b` is fine — it's block-axis; use `ps/pe`, `start/end` for inline).
- Colors via existing theme tokens (`gray-*`, `apple-9`, `apple-10`, `apple-contrast`). No raw hex / Tailwind palette classes.
- Subscription tiers are exactly `'associate' | 'candidate' | 'rpoc'` (`SubscriptionsSchema` from `@/types`).
- Query key: `dataKeys.courseBoard(courseId)` → `['admin','course-board',courseId]`.
- Lesson PATCH endpoint: `/api/admin/lessons/${lessonId}`.
- Verification commands: `pnpm test` (Vitest), `pnpm check` (Biome format+lint), `pnpm exec tsc --noEmit` (types).
- Vitest conventions: `// @vitest-environment jsdom` for DOM tests; `vi.spyOn(globalThis,'fetch')`; `vi.restoreAllMocks()` in `afterEach`.

---

### Task 1: Board data — schemas + course-board query

Add the config fields to the board schemas and the `getCourseBoard` query so the modal can read them. These change together to keep the type checker green (the query's object literal must satisfy the schema-inferred types).

**Files:**
- Modify: `src/lib/admin-schemas.ts` (add import; `boardLessonSchema`; `boardModuleSchema`)
- Modify: `src/db/admin.ts` (`getCourseBoard` select + map; add `SubscriptionType` import)
- Test: `src/lib/__tests__/board-schemas.test.ts` (create)

**Interfaces:**
- Produces: `BoardLesson` now has `hasDebrief: boolean` and `requiredSubscriptions: SubscriptionType[]`. `BoardModule` now has `requiredSubscriptions: SubscriptionType[]`. `getCourseBoard(courseId)` returns these populated.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/board-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { boardLessonSchema, boardModuleSchema } from '../admin-schemas';

describe('boardLessonSchema', () => {
  it('parses a lesson with config fields', () => {
    const parsed = boardLessonSchema.parse({
      id: 1, name: 'L', slug: 'l', rank: 1,
      isAvailable: true, hasDebrief: false,
      requiredSubscriptions: ['associate'],
      isConfigured: false, videoProvider: null, videoRef: null,
    });
    expect(parsed.hasDebrief).toBe(false);
    expect(parsed.requiredSubscriptions).toEqual(['associate']);
  });

  it('rejects an unknown subscription tier', () => {
    expect(() =>
      boardLessonSchema.parse({
        id: 1, name: 'L', slug: 'l', rank: 1,
        isAvailable: true, hasDebrief: true,
        requiredSubscriptions: ['gold'],
        isConfigured: false, videoProvider: null, videoRef: null,
      }),
    ).toThrow();
  });
});

describe('boardModuleSchema', () => {
  it('parses a module with requiredSubscriptions', () => {
    const parsed = boardModuleSchema.parse({
      id: 1, name: 'M', slug: 'm', imageUrlAvif: null, imageUrlWebp: null,
      rank: 1, requiredSubscriptions: ['candidate'], lessons: [],
    });
    expect(parsed.requiredSubscriptions).toEqual(['candidate']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/board-schemas.test.ts`
Expected: FAIL — `boardLessonSchema` strips/doesn't require `hasDebrief`/`requiredSubscriptions`; module parse missing `requiredSubscriptions`.

- [ ] **Step 3: Add the import and extend the schemas**

In `src/lib/admin-schemas.ts`, add after the existing imports (top of file):

```ts
import { SubscriptionsSchema } from '@/types';
```

Replace `boardLessonSchema` with:

```ts
export const boardLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  rank: z.coerce.number(),
  isAvailable: z.boolean(),
  hasDebrief: z.boolean(),
  requiredSubscriptions: SubscriptionsSchema,
  /** A lesson counts as configured once it has a video. */
  isConfigured: z.boolean(),
  videoProvider: providerIdSchema.nullable(),
  videoRef: z.string().nullable(),
});
```

Replace `boardModuleSchema` with:

```ts
export const boardModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  rank: z.coerce.number(),
  requiredSubscriptions: SubscriptionsSchema,
  lessons: z.array(boardLessonSchema),
});
```

- [ ] **Step 4: Extend the `getCourseBoard` query**

In `src/db/admin.ts`, add to the type-import block (the `import type { … } from '@/types'` group, or add a new one near the other `@/types` imports):

```ts
import type { SubscriptionType } from '@/types';
```

In `getCourseBoard`, add `requiredSubscriptions` to the modules select (after `rank: modulesTable.rank,`):

```ts
      rank: modulesTable.rank,
      requiredSubscriptions: modulesTable.requiredSubscriptions,
```

Add the two lesson columns to the lessons select (after `isAvailable: lessonsTable.isAvailable,`):

```ts
          isAvailable: lessonsTable.isAvailable,
          hasDebrief: lessonsTable.hasDebrief,
          requiredSubscriptions: lessonsTable.requiredSubscriptions,
```

In the module map, add after `rank: Number(m.rank),`:

```ts
      rank: Number(m.rank),
      requiredSubscriptions: m.requiredSubscriptions as SubscriptionType[],
```

In the lesson map, add after `isAvailable: l.isAvailable,`:

```ts
        isAvailable: l.isAvailable,
        hasDebrief: l.hasDebrief,
        requiredSubscriptions: l.requiredSubscriptions as SubscriptionType[],
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run src/lib/__tests__/board-schemas.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, and no type errors (the query literal now satisfies the schemas).

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-schemas.ts src/db/admin.ts src/lib/__tests__/board-schemas.test.ts
git commit -m "feat(admin): expose lesson config fields on the course board"
```

---

### Task 2: Config PATCH — input schema, DB helper, endpoint branch

Add the strict input schema, the `updateLessonConfig` DB helper, and the third parse branch on the lesson PATCH route.

**Files:**
- Modify: `src/lib/admin-schemas.ts` (add `updateLessonConfigInputSchema` + type)
- Modify: `src/db/admin.ts` (add `updateLessonConfig`)
- Modify: `src/routes/api/admin/lessons.$lessonId.ts` (add config branch + imports)
- Test: `src/lib/__tests__/update-lesson-config-schema.test.ts` (create)

**Interfaces:**
- Consumes: `SubscriptionsSchema` (already imported in Task 1), `lessonsTable`, `db`, `sql`, `eq` (already imported in `db/admin.ts`).
- Produces:
  - `updateLessonConfigInputSchema` + `type UpdateLessonConfigInput = { isAvailable?: boolean; hasDebrief?: boolean; requiredSubscriptions?: SubscriptionType[] }`
  - `updateLessonConfig(lessonId: number, patch: UpdateLessonConfigInput): Promise<{ id: number; isAvailable: boolean; hasDebrief: boolean; requiredSubscriptions: SubscriptionType[] } | null>`

- [ ] **Step 1: Write the failing schema test**

Create `src/lib/__tests__/update-lesson-config-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { updateLessonConfigInputSchema } from '../admin-schemas';

describe('updateLessonConfigInputSchema', () => {
  it('accepts a single isAvailable field', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ isAvailable: false }).success,
    ).toBe(true);
  });

  it('accepts requiredSubscriptions', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({
        requiredSubscriptions: ['associate'],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(updateLessonConfigInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown keys (e.g. a rename body)', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ name: 'x' }).success,
    ).toBe(false);
  });

  it('rejects an unknown subscription tier', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({
        requiredSubscriptions: ['gold'],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/update-lesson-config-schema.test.ts`
Expected: FAIL — `updateLessonConfigInputSchema` is not exported.

- [ ] **Step 3: Add the input schema**

In `src/lib/admin-schemas.ts`, add near the other lesson input schemas (after `renameLessonInputSchema` / `moveLessonInputSchema`):

```ts
/** PATCH body for the lesson Config tab. Every field optional; at least one required. */
export const updateLessonConfigInputSchema = z
  .object({
    isAvailable: z.boolean().optional(),
    hasDebrief: z.boolean().optional(),
    requiredSubscriptions: SubscriptionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateLessonConfigInput = z.infer<
  typeof updateLessonConfigInputSchema
>;
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/update-lesson-config-schema.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Add the `updateLessonConfig` DB helper**

In `src/db/admin.ts`, add next to `updateLessonName`:

```ts
export async function updateLessonConfig(
  lessonId: number,
  patch: {
    isAvailable?: boolean;
    hasDebrief?: boolean;
    requiredSubscriptions?: SubscriptionType[];
  },
): Promise<{
  id: number;
  isAvailable: boolean;
  hasDebrief: boolean;
  requiredSubscriptions: SubscriptionType[];
} | null> {
  const [updated] = await db
    .update(lessonsTable)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({
      id: lessonsTable.id,
      isAvailable: lessonsTable.isAvailable,
      hasDebrief: lessonsTable.hasDebrief,
      requiredSubscriptions: lessonsTable.requiredSubscriptions,
    });
  if (!updated) return null;
  return {
    ...updated,
    requiredSubscriptions: updated.requiredSubscriptions as SubscriptionType[],
  };
}
```

- [ ] **Step 6: Add the endpoint branch**

In `src/routes/api/admin/lessons.$lessonId.ts`:

Update the `db/admin` import to include `updateLessonConfig`:

```ts
import {
  deleteLesson,
  moveLesson,
  updateLessonConfig,
  updateLessonName,
} from '@/db/admin';
```

Update the `admin-schemas` import to include the config schema:

```ts
import {
  moveLessonInputSchema,
  renameLessonInputSchema,
  updateLessonConfigInputSchema,
} from '@/lib/admin-schemas';
```

Add the config branch inside `PATCH`, immediately before the final `return Response.json({ error: 'Invalid body' }, { status: 400 });`:

```ts
        const config = updateLessonConfigInputSchema.safeParse(body);
        if (config.success) {
          const updated = await updateLessonConfig(lessonId, config.data);
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS; no type errors. (The rename `{ name }` and move `{ targetModuleId, … }` branches are parsed first and are disjoint from the strict config body, so ordering is safe.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-schemas.ts src/db/admin.ts src/routes/api/admin/lessons.\$lessonId.ts src/lib/__tests__/update-lesson-config-schema.test.ts
git commit -m "feat(admin): PATCH lesson config (availability/access/debrief)"
```

---

### Task 3: `useUpdateLessonConfig` data hook (optimistic)

Optimistic mutation that patches the target lesson in the `courseBoard` cache, rolls back on error with a toast, and invalidates on settle.

**Files:**
- Create: `src/data-hooks/use-update-lesson-config.ts`
- Test: `src/data-hooks/__tests__/use-update-lesson-config.test.tsx`

**Interfaces:**
- Consumes: `dataKeys.courseBoard`, `CourseBoard` + `UpdateLessonConfigInput` (from `@/lib/admin-schemas`), `toast` (sonner).
- Produces: `useUpdateLessonConfig(courseId: number)` → mutation whose variable is `{ lessonId: number; patch: UpdateLessonConfigInput }`.

- [ ] **Step 1: Write the failing test**

Create `src/data-hooks/__tests__/use-update-lesson-config.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseBoard } from '#/lib/admin-schemas';
import { dataKeys } from '../keys';
import { useUpdateLessonConfig } from '../use-update-lesson-config';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const COURSE_ID = 7;

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const board: CourseBoard = {
    course: {
      id: COURSE_ID, name: 'C', slug: 'c', description: null,
      imageUrlAvif: null, imageUrlWebp: null,
    },
    modules: [
      {
        id: 1, name: 'M', slug: 'm', imageUrlAvif: null, imageUrlWebp: null,
        rank: 1, requiredSubscriptions: ['associate'],
        lessons: [
          {
            id: 10, name: 'L', slug: 'l', rank: 1,
            isAvailable: false, hasDebrief: true, requiredSubscriptions: [],
            isConfigured: false, videoProvider: null, videoRef: null,
          },
        ],
      },
    ],
  };
  client.setQueryData(dataKeys.courseBoard(COURSE_ID), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe('useUpdateLessonConfig', () => {
  it('optimistically patches the lesson in the board cache', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        patch: { isAvailable: true },
      });
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[0].lessons[0].isAvailable).toBe(true);
  });

  it('rolls back the cache on error', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 500 }),
    );
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({ lessonId: 10, patch: { isAvailable: true } })
        .catch(() => {});
    });

    const board = client.getQueryData<CourseBoard>(
      dataKeys.courseBoard(COURSE_ID),
    );
    expect(board?.modules[0].lessons[0].isAvailable).toBe(false);
  });

  it('PATCHes the patch as JSON to the lesson route', async () => {
    const { wrapper } = makeHarness();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useUpdateLessonConfig(COURSE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        lessonId: 10,
        patch: { hasDebrief: false },
      });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/10');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ hasDebrief: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-update-lesson-config.test.tsx`
Expected: FAIL — module `../use-update-lesson-config` not found.

- [ ] **Step 3: Write the hook**

Create `src/data-hooks/use-update-lesson-config.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CourseBoard, UpdateLessonConfigInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Patch a lesson's Config-tab settings (availability / access / debrief).
 * Optimistically flips the value in the course-board cache so the toggle
 * responds instantly; rolls back with a toast on error.
 */
export function useUpdateLessonConfig(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lessonId: number;
      patch: UpdateLessonConfigInput;
    }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.patch),
      });
      if (!res.ok) {
        throw new Error(`Failed to update lesson config (${res.status})`);
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.courseBoard(courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard>(key);
      if (previous) {
        queryClient.setQueryData<CourseBoard>(key, {
          ...previous,
          modules: previous.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === input.lessonId ? { ...l, ...input.patch } : l,
            ),
          })),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error("Couldn't update setting");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-update-lesson-config.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/data-hooks/use-update-lesson-config.ts src/data-hooks/__tests__/use-update-lesson-config.test.tsx
git commit -m "feat(admin): optimistic useUpdateLessonConfig hook"
```

---

### Task 4: `BinaryToggle` presentational component

A two-option single-select segmented control on Base UI `ToggleGroup`.

**Files:**
- Create: `src/components/admin/lesson-config/binary-toggle.tsx`
- Test: `src/components/admin/lesson-config/__tests__/binary-toggle.test.tsx`

**Interfaces:**
- Produces: `BinaryToggle<V extends string>` with props `{ value: V; onValueChange: (next: V) => void; options: readonly [BinaryToggleOption<V>, BinaryToggleOption<V>]; disabledValue?: V; label: string }` and `interface BinaryToggleOption<V> { value: V; label: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/binary-toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BinaryToggle } from '../binary-toggle';

const options = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

describe('BinaryToggle', () => {
  it('marks the active option pressed', () => {
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={() => {}}
        options={options}
      />,
    );
    expect(screen.getByRole('button', { name: 'On' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onValueChange with the newly selected value', () => {
    const onValueChange = vi.fn();
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={onValueChange}
        options={options}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onValueChange).toHaveBeenCalledWith('off');
  });

  it('does not fire when the active option is clicked (empty-selection guard)', () => {
    const onValueChange = vi.fn();
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={onValueChange}
        options={options}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'On' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disables the option named by disabledValue', () => {
    render(
      <BinaryToggle
        label="Access"
        value="off"
        onValueChange={() => {}}
        options={options}
        disabledValue="on"
      />,
    );
    expect(screen.getByRole('button', { name: 'On' })).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/binary-toggle.test.tsx`
Expected: FAIL — `../binary-toggle` not found.

- [ ] **Step 3: Write the component**

Create `src/components/admin/lesson-config/binary-toggle.tsx`:

```tsx
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/cn';

export interface BinaryToggleOption<V extends string> {
  value: V;
  label: string;
}

interface BinaryToggleProps<V extends string> {
  /** Currently selected value. */
  value: V;
  onValueChange: (next: V) => void;
  options: readonly [BinaryToggleOption<V>, BinaryToggleOption<V>];
  /** Optional value rendered disabled (e.g. an unavailable choice). */
  disabledValue?: V;
  /** Accessible name for the group (the setting name). */
  label: string;
}

/**
 * Two-option single-select segmented control on Base UI ToggleGroup.
 * Presentational: the parent owns the value and persistence. A single-select
 * ToggleGroup emits an empty array when the active item is clicked; that
 * change is ignored so the control always keeps a value.
 */
export const BinaryToggle = <V extends string>({
  value,
  onValueChange,
  options,
  disabledValue,
  label,
}: BinaryToggleProps<V>) => {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(groupValue) => {
        const next = groupValue[0] as V | undefined;
        if (next && next !== value) onValueChange(next);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-6 bg-gray-1 p-1"
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.value === disabledValue}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium text-gray-11 text-sm transition-colors',
            'hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
            'data-[pressed]:bg-apple-9 data-[pressed]:text-apple-contrast',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/binary-toggle.test.tsx`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-config/binary-toggle.tsx src/components/admin/lesson-config/__tests__/binary-toggle.test.tsx
git commit -m "feat(admin): BinaryToggle segmented control"
```

---

### Task 5: `ConfigSettingRow` presentational component

Pure row layout: title + description at the inline-start, control at the inline-end.

**Files:**
- Create: `src/components/admin/lesson-config/config-setting-row.tsx`
- Test: `src/components/admin/lesson-config/__tests__/config-setting-row.test.tsx`

**Interfaces:**
- Produces: `ConfigSettingRow` with props `{ title: string; description: string; children: ReactNode }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/config-setting-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigSettingRow } from '../config-setting-row';

describe('ConfigSettingRow', () => {
  it('renders the title, description, and control', () => {
    render(
      <ConfigSettingRow title="Availability" description="Who can open it.">
        <button type="button">control</button>
      </ConfigSettingRow>,
    );
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeTruthy();
    expect(screen.getByText('Who can open it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'control' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-setting-row.test.tsx`
Expected: FAIL — `../config-setting-row` not found.

- [ ] **Step 3: Write the component**

Create `src/components/admin/lesson-config/config-setting-row.tsx`:

```tsx
import type { ReactNode } from 'react';

interface ConfigSettingRowProps {
  title: string;
  description: string;
  /** The control (a BinaryToggle), rendered at the inline-end. */
  children: ReactNode;
}

/** One row of the lesson Config tab: text at the start, control at the end. */
export const ConfigSettingRow = ({
  title,
  description,
  children,
}: ConfigSettingRowProps) => {
  return (
    <div className="flex items-center justify-between gap-6 border-gray-6 border-b py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-gray-12 text-sm">{title}</h3>
        <p className="text-gray-11 text-sm">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-setting-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-config/config-setting-row.tsx src/components/admin/lesson-config/__tests__/config-setting-row.test.tsx
git commit -m "feat(admin): ConfigSettingRow layout"
```

---

### Task 6: `config-mappings` pure helpers

Pure functions mapping lesson/module state to each toggle's value and back — including the module-is-free rule. This isolates the one real judgment call for direct testing.

**Files:**
- Create: `src/components/admin/lesson-config/config-mappings.ts`
- Test: `src/components/admin/lesson-config/__tests__/config-mappings.test.ts`

**Interfaces:**
- Consumes: `BoardLesson`, `BoardModule` (from `@/lib/admin-schemas`), `SubscriptionType` (from `@/types`).
- Produces:
  - `type AvailabilityValue = 'public' | 'private'`, `type AccessValue = 'free' | 'subscription'`, `type DebriefValue = 'on' | 'off'`
  - `availabilityValue(lesson): AvailabilityValue`
  - `accessValue(lesson): AccessValue`
  - `debriefValue(lesson): DebriefValue`
  - `isSubscriptionDisabled(module): boolean`
  - `accessSubscriptions(next: AccessValue, module): SubscriptionType[]`

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/config-mappings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import {
  accessSubscriptions,
  accessValue,
  availabilityValue,
  debriefValue,
  isSubscriptionDisabled,
} from '../config-mappings';

const lesson = (over: Partial<BoardLesson> = {}): BoardLesson => ({
  id: 10, name: 'L', slug: 'l', rank: 1,
  isAvailable: false, hasDebrief: true, requiredSubscriptions: [],
  isConfigured: false, videoProvider: null, videoRef: null,
  ...over,
});

const module = (over: Partial<BoardModule> = {}): BoardModule => ({
  id: 1, name: 'M', slug: 'm', imageUrlAvif: null, imageUrlWebp: null,
  rank: 1, requiredSubscriptions: ['associate'], lessons: [],
  ...over,
});

describe('config-mappings', () => {
  it('maps availability', () => {
    expect(availabilityValue(lesson({ isAvailable: true }))).toBe('public');
    expect(availabilityValue(lesson({ isAvailable: false }))).toBe('private');
  });

  it('maps debrief', () => {
    expect(debriefValue(lesson({ hasDebrief: true }))).toBe('on');
    expect(debriefValue(lesson({ hasDebrief: false }))).toBe('off');
  });

  it('reads access from the lesson subscriptions', () => {
    expect(accessValue(lesson({ requiredSubscriptions: [] }))).toBe('free');
    expect(accessValue(lesson({ requiredSubscriptions: ['associate'] }))).toBe('subscription');
  });

  it('disables subscription only when the module is free', () => {
    expect(isSubscriptionDisabled(module({ requiredSubscriptions: [] }))).toBe(true);
    expect(isSubscriptionDisabled(module({ requiredSubscriptions: ['rpoc'] }))).toBe(false);
  });

  it('inherits the module subscriptions for subscription, clears for free', () => {
    const mod = module({ requiredSubscriptions: ['associate', 'candidate'] });
    expect(accessSubscriptions('subscription', mod)).toEqual(['associate', 'candidate']);
    expect(accessSubscriptions('free', mod)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-mappings.test.ts`
Expected: FAIL — `../config-mappings` not found.

- [ ] **Step 3: Write the helpers**

Create `src/components/admin/lesson-config/config-mappings.ts`:

```ts
import type { BoardLesson, BoardModule } from '@/lib/admin-schemas';
import type { SubscriptionType } from '@/types';

export type AvailabilityValue = 'public' | 'private';
export type AccessValue = 'free' | 'subscription';
export type DebriefValue = 'on' | 'off';

export const availabilityValue = (lesson: BoardLesson): AvailabilityValue =>
  lesson.isAvailable ? 'public' : 'private';

export const debriefValue = (lesson: BoardLesson): DebriefValue =>
  lesson.hasDebrief ? 'on' : 'off';

export const accessValue = (lesson: BoardLesson): AccessValue =>
  lesson.requiredSubscriptions.length > 0 ? 'subscription' : 'free';

/** A lesson can only inherit subscriptions if its module has any. */
export const isSubscriptionDisabled = (module: BoardModule): boolean =>
  module.requiredSubscriptions.length === 0;

/** Map an Access choice to the required_subscriptions array to persist. */
export const accessSubscriptions = (
  next: AccessValue,
  module: BoardModule,
): SubscriptionType[] =>
  next === 'subscription' ? [...module.requiredSubscriptions] : [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-mappings.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-config/config-mappings.ts src/components/admin/lesson-config/__tests__/config-mappings.test.ts
git commit -m "feat(admin): pure lesson-config toggle mappings"
```

---

### Task 7: `ConfigSectionContainer`

Container that composes the three rows, wiring each toggle to `useUpdateLessonConfig` via the pure mappings.

**Files:**
- Create: `src/components/admin/lesson-config/config-section-container.tsx`
- Test: `src/components/admin/lesson-config/__tests__/config-section-container.test.tsx`

**Interfaces:**
- Consumes: `useUpdateLessonConfig` (Task 3), `BinaryToggle` (Task 4), `ConfigSettingRow` (Task 5), `config-mappings` (Task 6), `BoardLesson`/`BoardModule`.
- Produces: `ConfigSectionContainer` with props `{ courseId: number; lesson: BoardLesson; module: BoardModule }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/config-section-container.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { ConfigSectionContainer } from '../config-section-container';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const lesson: BoardLesson = {
  id: 10, name: 'L', slug: 'l', rank: 1,
  isAvailable: true, hasDebrief: true, requiredSubscriptions: [],
  isConfigured: false, videoProvider: null, videoRef: null,
};
const paidModule: BoardModule = {
  id: 1, name: 'M', slug: 'm', imageUrlAvif: null, imageUrlWebp: null,
  rank: 1, requiredSubscriptions: ['associate'], lessons: [lesson],
};
const freeModule: BoardModule = { ...paidModule, requiredSubscriptions: [] };

describe('ConfigSectionContainer', () => {
  it('renders the three setting rows', () => {
    render(
      <ConfigSectionContainer courseId={1} lesson={lesson} module={paidModule} />,
      { wrapper },
    );
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Access' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Debrief' })).toBeTruthy();
  });

  it('marks the active availability option pressed', () => {
    render(
      <ConfigSectionContainer courseId={1} lesson={lesson} module={paidModule} />,
      { wrapper },
    );
    expect(
      screen.getByRole('button', { name: 'Public' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('disables the Subscription option when the module is free', () => {
    render(
      <ConfigSectionContainer courseId={1} lesson={lesson} module={freeModule} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: 'Subscription' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-section-container.test.tsx`
Expected: FAIL — `../config-section-container` not found.

- [ ] **Step 3: Write the container**

Create `src/components/admin/lesson-config/config-section-container.tsx`:

```tsx
import { useUpdateLessonConfig } from '@/data-hooks/use-update-lesson-config';
import type { BoardLesson, BoardModule } from '@/lib/admin-schemas';
import { BinaryToggle } from './binary-toggle';
import {
  type AccessValue,
  type AvailabilityValue,
  type DebriefValue,
  accessSubscriptions,
  accessValue,
  availabilityValue,
  debriefValue,
  isSubscriptionDisabled,
} from './config-mappings';
import { ConfigSettingRow } from './config-setting-row';

interface ConfigSectionContainerProps {
  courseId: number;
  lesson: BoardLesson;
  module: BoardModule;
}

/** Config tab: availability / access / debrief toggles, each auto-saving on change. */
export const ConfigSectionContainer = ({
  courseId,
  lesson,
  module: mod,
}: ConfigSectionContainerProps) => {
  const updateConfig = useUpdateLessonConfig(courseId);
  const subscriptionDisabled = isSubscriptionDisabled(mod);

  return (
    <div className="flex flex-col">
      <ConfigSettingRow
        title="Availability"
        description="Whether learners can see and open this lesson."
      >
        <BinaryToggle<AvailabilityValue>
          label="Availability"
          value={availabilityValue(lesson)}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { isAvailable: next === 'public' },
            })
          }
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
        />
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Access"
        description={
          subscriptionDisabled
            ? 'This module is free — set the module’s access first.'
            : 'Free for everyone, or limited to the module’s subscriptions.'
        }
      >
        <BinaryToggle<AccessValue>
          label="Access"
          value={accessValue(lesson)}
          disabledValue={subscriptionDisabled ? 'subscription' : undefined}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { requiredSubscriptions: accessSubscriptions(next, mod) },
            })
          }
          options={[
            { value: 'free', label: 'Free' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Debrief"
        description="Show the post-lesson debrief for this lesson."
      >
        <BinaryToggle<DebriefValue>
          label="Debrief"
          value={debriefValue(lesson)}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { hasDebrief: next === 'on' },
            })
          }
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </ConfigSettingRow>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/config-section-container.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-config/config-section-container.tsx src/components/admin/lesson-config/__tests__/config-section-container.test.tsx
git commit -m "feat(admin): ConfigSectionContainer wiring toggles to save"
```

---

### Task 8: Wire the modal — three tabs, pass modules

Replace the three placeholder tabs with the single Config tab and feed the dialog `modules` so it can find each lesson's parent module.

**Files:**
- Modify: `src/components/admin/lesson-config-dialog-container.tsx` (rewrite)
- Modify: `src/components/admin/module-board-container.tsx:306-309` (mount props)

**Interfaces:**
- Consumes: `ConfigSectionContainer` (Task 7), `BoardModule`.
- Produces: `LessonConfigDialogContainer` now takes `{ courseId: number; modules: BoardModule[] }`.

- [ ] **Step 1: Rewrite the dialog container**

Replace the entire contents of `src/components/admin/lesson-config-dialog-container.tsx` with:

```tsx
import { useAtom } from 'jotai';

import { configureLessonIdAtom } from '@/atoms/admin';
import type { BoardModule } from '@/lib/admin-schemas';
import { ConfigSectionContainer } from './lesson-config/config-section-container';
import { MaterialSectionContainer } from './lesson-config/material-section-container';
import { VideoSectionContainer } from './lesson-config/video-section-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

/** Big JIRA-style lesson configuration modal (tab sidebar + main panel). */
export const LessonConfigDialogContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const [lessonId, setLessonId] = useAtom(configureLessonIdAtom);
  const parentModule =
    modules.find((m) => m.lessons.some((l) => l.id === lessonId)) ?? null;
  const lesson = parentModule?.lessons.find((l) => l.id === lessonId) ?? null;

  const sections: ConfigModalSection[] = [
    {
      value: 'video',
      title: 'Video',
      content: lesson && (
        <VideoSectionContainer courseId={courseId} lesson={lesson} />
      ),
    },
    {
      value: 'material',
      title: 'Material',
      content: lesson && <MaterialSectionContainer lesson={lesson} />,
    },
    {
      value: 'config',
      title: 'Config',
      content: lesson && parentModule && (
        <ConfigSectionContainer
          courseId={courseId}
          lesson={lesson}
          module={parentModule}
        />
      ),
    },
  ];

  return (
    <SectionedConfigModal
      open={lessonId !== null}
      onOpenChange={(open) => {
        if (!open) setLessonId(null);
      }}
      title="Configure lesson"
      heading={lesson?.name ?? ''}
      sections={sections}
    />
  );
};
```

- [ ] **Step 2: Update the mount in module-board-container**

In `src/components/admin/module-board-container.tsx`, replace the `LessonConfigDialogContainer` mount (around line 306):

```tsx
      <LessonConfigDialogContainer courseId={courseId} modules={modules} />
```

- [ ] **Step 3: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors; all tests pass. (`modules` is already in scope in `ModuleBoard` — it's the `BoardModule[]` prop used throughout the file.)

- [ ] **Step 4: Lint/format**

Run: `pnpm check`
Expected: no errors. If Biome reports formatting fixes, run `pnpm exec biome check --write src/components/admin/lesson-config-dialog-container.tsx src/components/admin/module-board-container.tsx src/components/admin/lesson-config/` and re-run `pnpm check`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-config-dialog-container.tsx src/components/admin/module-board-container.tsx
git commit -m "feat(admin): three-tab lesson config modal with live Config tab"
```

- [ ] **Step 6: Manual verification (drive the real UI)**

Use the `verify` skill (or run `pnpm dev` and open an admin course board). Confirm:
- The lesson config modal shows exactly three tabs: **Video · Material · Config**.
- The Config tab shows three rows (Availability / Access / Debrief), each with a two-option toggle on the inline-end.
- Toggling Availability flips instantly and survives a modal close/reopen (persisted).
- For a lesson whose module has subscriptions: switching Access to **Subscription** persists the module's tiers; **Free** clears them.
- For a lesson whose module is **Free**: the **Subscription** option is disabled with the hint copy.
- Debrief On/Off persists.

---

## Notes for the implementer

- **No DB migration.** `is_available`, `has_debrief`, `required_subscriptions` already exist on `lessons` (see `src/db/schema.ts:105-107,103`). Do not run `drizzle-kit`.
- **Endpoint branch order is intentional.** Rename (`{ name }`) and move (`{ targetModuleId, … }`) are parsed before the config branch; the config schema is `.strict()` and its keys are disjoint from both, so a config body never matches the earlier branches and vice-versa.
- **Optimistic cache shape.** `useUpdateLessonConfig` spreads `patch` onto the matching lesson; because `patch` keys (`isAvailable`/`hasDebrief`/`requiredSubscriptions`) are a subset of `BoardLesson`, the spread is type-safe and complete.
- **`module` param.** Destructured as `module: mod` in the container to avoid shadowing/readability issues with the CommonJS `module` global, matching the repo's existing `module: mod` alias convention.
