# Course Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `courseDetails.modules` and their `lessons` inside `AppShell`'s `aside` using a Base UI Accordion, with a single-stateful-wrapper + pure-children split, a motion shimmer skeleton that blur-to-focus reveals real data, a white-label CSS-variable token system, and an accent focus-visible outline.

**Architecture:** One wrapper (`CourseSidebarWrapper`) runs `useCourseDetails`, `useParams`, and a `Jotai` atom, then renders exactly one pure component (`CourseSidebar`). Every other file is a pure presentational component — props in, JSX out, no hooks besides refs or Base UI primitives. All spacing, colors, radii, durations, and shadows resolve through named CSS variables defined in `src/styles.css` `@theme`. No arbitrary-value Tailwind classes anywhere.

**Tech Stack:** React 19, TanStack Router (file-based routes), TanStack Query, Jotai, Base UI `@base-ui/react`, Motion (`motion/react`), Tailwind v4 + `@theme` tokens, Vitest + React Testing Library + jsdom, Biome (format/lint).

**Spec:** `docs/superpowers/specs/2026-04-24-course-sidebar-design.md`

---

## File map

**New files:**

- `src/atoms/sidebar.ts` — `openModuleSlugAtom`
- `src/lib/sidebar-motion.ts` — CSS-var → motion number/bezier bridge
- `src/components/sidebar/course-sidebar-wrapper.tsx` — WRAPPER (hooks/atoms/router)
- `src/components/sidebar/course-sidebar.tsx` — pure (motion stage + status branch)
- `src/components/sidebar/sidebar-skeleton.tsx` — pure shimmer
- `src/components/sidebar/sidebar-error.tsx` — pure error text
- `src/components/sidebar/course-sidebar-header.tsx` — pure title + counts
- `src/components/sidebar/module-accordion.tsx` — pure `Accordion.Root`
- `src/components/sidebar/module-item.tsx` — pure `Accordion.Item/Header/Trigger/Panel`
- `src/components/sidebar/lesson-list.tsx` — pure `<ul>` + map
- `src/components/sidebar/lesson-link.tsx` — pure `<Link>` + active
- `src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx` — placeholder lesson route
- `src/components/sidebar/__tests__/*.test.tsx` — one test file per component
- `src/routes/__tests__/modules.lessons.test.tsx` — placeholder route test

**Modified files:**

- `src/styles.css` — append sidebar tokens to `@theme { … }` and sidebar component classes under `@layer components`
- `src/routes/index.tsx` — swap empty `<nav>` aside for `<CourseSidebarWrapper />`
- `package.json` + lockfile — add `@base-ui/react`, `motion`, `jotai`

---

## Task 1: Install new dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run:

```bash
pnpm add @base-ui/react motion jotai
```

Expected: three packages added to `dependencies` in `package.json`, lockfile updated.

- [ ] **Step 2: Verify installs resolve**

Run:

```bash
pnpm ls @base-ui/react motion jotai
```

Expected: each package prints a resolved version, no `missing peer` warnings that block the app.

- [ ] **Step 3: Type-check the repo**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: exit 0 (or pre-existing unrelated issues, but no missing-module errors on the three new packages).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @base-ui/react, motion, and jotai for course sidebar"
```

---

## Task 2: Add sidebar tokens + component classes to styles.css

**Files:**

- Modify: `src/styles.css`

- [ ] **Step 1: Open `src/styles.css` and locate the existing `@theme` block**

The file imports `theme.generated.css` (which has the `@theme` block with `--color-*` tokens). Add a second, sidebar-specific `@theme` block after the generated import. Tailwind v4 merges multiple `@theme` blocks.

- [ ] **Step 2: Append sidebar tokens and component classes**

Append the following at the end of `src/styles.css`:

```css
@theme {
  /* sidebar spacing */
  --spacing-sidebar-row-block: calc(var(--spacing) * 2);
  --spacing-sidebar-row-inline: calc(var(--spacing) * 3);
  --spacing-sidebar-lesson-indent: calc(var(--spacing) * 6);
  --spacing-sidebar-row-gap: calc(var(--spacing) * 1);
  --spacing-sidebar-section-gap: calc(var(--spacing) * 3);

  /* sidebar shape */
  --radius-sidebar-row: var(--radius-md);

  /* sidebar static tokens (no utility generation) */
  --border-width-sidebar-active: 2px;
  --outline-width-sidebar-focus: 2px;
  --outline-offset-sidebar-focus: 2px;
  --color-sidebar-focus-ring: var(--color-accent-9);

  /* sidebar animation */
  --duration-sidebar-chevron: 200ms;
  --duration-sidebar-reveal: 320ms;
  --duration-sidebar-shimmer: 1400ms;
  --ease-sidebar: var(--ease-out-cubic);
  --blur-sidebar-reveal: 2px;
  --sidebar-skeleton-row-opacity-step: 0.12;

  /* sidebar skeleton row heights */
  --block-size-sidebar-skeleton-header: calc(var(--spacing) * 10);
  --block-size-sidebar-skeleton-module: calc(var(--spacing) * 9);
  --block-size-sidebar-skeleton-lesson: calc(var(--spacing) * 7);
}

@layer components {
  /* Focus-visible ring applied via semantic class; no Tailwind arbitrary values. */
  .sidebar-focus-ring:focus-visible {
    outline-style: solid;
    outline-color: var(--color-sidebar-focus-ring);
    outline-width: var(--outline-width-sidebar-focus);
    outline-offset: var(--outline-offset-sidebar-focus);
  }
  .sidebar-focus-ring:focus:not(:focus-visible) {
    outline: none;
  }

  /* Active-lesson row appearance. */
  .sidebar-row-active {
    background-color: var(--color-accent-3);
    color: var(--color-accent-11);
    border-inline-start-width: var(--border-width-sidebar-active);
    border-inline-start-style: solid;
    border-inline-start-color: var(--color-accent-7);
  }

  /* Chevron rotation flip (Base UI Trigger exposes data-panel-open). */
  .sidebar-chevron {
    transition-property: transform;
    transition-duration: var(--duration-sidebar-chevron);
    transition-timing-function: var(--ease-sidebar);
    transform: rotate(-90deg);
  }
  [data-panel-open] .sidebar-chevron {
    transform: rotate(0deg);
  }

  /* Skeleton shimmer: a wide gradient moving across the background. */
  .sidebar-skeleton-row {
    background-image: linear-gradient(
      90deg,
      var(--color-gray-3) 0%,
      var(--color-gray-4) 50%,
      var(--color-gray-3) 100%
    );
    background-size: 200% 100%;
    background-repeat: no-repeat;
    border-radius: var(--radius-sidebar-row);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-chevron {
      transition-duration: 0ms;
    }
    .sidebar-skeleton-row {
      background-image: none;
      background-color: var(--color-gray-3);
    }
  }
}
```

- [ ] **Step 3: Verify the dev server picks up tokens**

Run:

```bash
pnpm dev
```

Open `http://localhost:3000`, confirm the existing shell still renders without errors. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat(styles): add sidebar tokens and component classes"
```

---

## Task 3: Create `openModuleSlugAtom`

**Files:**

- Create: `src/atoms/sidebar.ts`
- Test: `src/atoms/__tests__/sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/atoms/__tests__/sidebar.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { useAtom } from 'jotai';
import { describe, expect, it } from 'vitest';
import { openModuleSlugAtom } from '../sidebar';

describe('openModuleSlugAtom', () => {
  it('defaults to null', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    expect(result.current[0]).toBeNull();
  });

  it('stores the provided slug', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    act(() => result.current[1]('getting-started'));
    expect(result.current[0]).toBe('getting-started');
  });

  it('accepts null to close', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    act(() => result.current[1]('getting-started'));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/atoms/__tests__/sidebar.test.ts
```

Expected: FAIL — `Cannot find module '../sidebar'`.

- [ ] **Step 3: Create the atom**

Create `src/atoms/sidebar.ts`:

```ts
import { atom } from 'jotai';

export const openModuleSlugAtom = atom<string | null>(null);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/atoms/__tests__/sidebar.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/atoms/sidebar.ts src/atoms/__tests__/sidebar.test.ts
git commit -m "feat(atoms): add openModuleSlugAtom for sidebar accordion state"
```

---

## Task 4: Create `src/lib/sidebar-motion.ts` (CSS-var → motion bridge)

**Files:**

- Create: `src/lib/sidebar-motion.ts`
- Test: `src/lib/__tests__/sidebar-motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/sidebar-motion.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseCubicBezierString,
  readSidebarMotionTokens,
  SIDEBAR_MOTION_FALLBACK,
} from '../sidebar-motion';

function setTokens(tokens: Record<string, string>) {
  const style = document.documentElement.style;
  for (const [k, v] of Object.entries(tokens)) style.setProperty(k, v);
}

describe('parseCubicBezierString', () => {
  it('parses a valid cubic-bezier() string into 4 numbers', () => {
    expect(parseCubicBezierString('cubic-bezier(0.215, 0.61, 0.355, 1)')).toEqual([
      0.215, 0.61, 0.355, 1,
    ]);
  });

  it('returns null for an unparseable value', () => {
    expect(parseCubicBezierString('ease')).toBeNull();
    expect(parseCubicBezierString('')).toBeNull();
  });
});

describe('readSidebarMotionTokens', () => {
  beforeEach(() => {
    const style = document.documentElement.style;
    [
      '--duration-sidebar-reveal',
      '--duration-sidebar-chevron',
      '--duration-sidebar-shimmer',
      '--ease-sidebar',
    ].forEach((p) => style.removeProperty(p));
  });

  it('returns fallbacks when tokens are missing', () => {
    const t = readSidebarMotionTokens();
    expect(t).toEqual(SIDEBAR_MOTION_FALLBACK);
  });

  it('converts ms durations to seconds and parses the bezier', () => {
    setTokens({
      '--duration-sidebar-reveal': '320ms',
      '--duration-sidebar-chevron': '200ms',
      '--duration-sidebar-shimmer': '1400ms',
      '--ease-sidebar': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    });
    const t = readSidebarMotionTokens();
    expect(t.revealS).toBeCloseTo(0.32, 3);
    expect(t.chevronS).toBeCloseTo(0.2, 3);
    expect(t.shimmerS).toBeCloseTo(1.4, 3);
    expect(t.ease).toEqual([0.215, 0.61, 0.355, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/__tests__/sidebar-motion.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `src/lib/sidebar-motion.ts`:

```ts
export type CubicBezier = [number, number, number, number];

export type SidebarMotionTokens = {
  revealS: number;
  chevronS: number;
  shimmerS: number;
  ease: CubicBezier;
};

export const SIDEBAR_MOTION_FALLBACK: SidebarMotionTokens = {
  revealS: 0.32,
  chevronS: 0.2,
  shimmerS: 1.4,
  ease: [0.215, 0.61, 0.355, 1],
};

export function parseCubicBezierString(value: string): CubicBezier | null {
  const match = value.trim().match(/^cubic-bezier\(\s*([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return parts as CubicBezier;
}

function parseMsToSeconds(value: string, fallbackS: number): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return fallbackS;
  return n / 1000;
}

export function readSidebarMotionTokens(): SidebarMotionTokens {
  if (typeof window === 'undefined') return SIDEBAR_MOTION_FALLBACK;
  const s = window.getComputedStyle(document.documentElement);
  const easeStr = s.getPropertyValue('--ease-sidebar');
  return {
    revealS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-reveal'),
      SIDEBAR_MOTION_FALLBACK.revealS,
    ),
    chevronS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-chevron'),
      SIDEBAR_MOTION_FALLBACK.chevronS,
    ),
    shimmerS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-shimmer'),
      SIDEBAR_MOTION_FALLBACK.shimmerS,
    ),
    ease: parseCubicBezierString(easeStr) ?? SIDEBAR_MOTION_FALLBACK.ease,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/lib/__tests__/sidebar-motion.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebar-motion.ts src/lib/__tests__/sidebar-motion.test.ts
git commit -m "feat(lib): add sidebar-motion token bridge for motion/react"
```

---

## Task 5: `SidebarError` (pure)

**Files:**

- Create: `src/components/sidebar/sidebar-error.tsx`
- Test: `src/components/sidebar/__tests__/sidebar-error.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/sidebar-error.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarError } from '../sidebar-error';

describe('SidebarError', () => {
  it('renders the provided message', () => {
    render(<SidebarError message="Boom" />);
    expect(screen.getByRole('alert').textContent).toBe('Boom');
  });

  it('renders a default message when none is provided', () => {
    render(<SidebarError />);
    expect(screen.getByRole('alert').textContent).toBe(
      "Couldn't load the course",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/sidebar-error.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/sidebar-error.tsx`:

```tsx
type SidebarErrorProps = {
  message?: string;
};

export const SidebarError = ({
  message = "Couldn't load the course",
}: SidebarErrorProps) => (
  <p
    role="alert"
    className="px-sidebar-row-inline py-sidebar-row-block text-sm text-gray-11"
  >
    {message}
  </p>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/sidebar-error.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/sidebar-error.tsx src/components/sidebar/__tests__/sidebar-error.test.tsx
git commit -m "feat(sidebar): add pure SidebarError component"
```

---

## Task 6: `SidebarSkeleton` (pure)

**Files:**

- Create: `src/components/sidebar/sidebar-skeleton.tsx`
- Test: `src/components/sidebar/__tests__/sidebar-skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/sidebar-skeleton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarSkeleton } from '../sidebar-skeleton';

describe('SidebarSkeleton', () => {
  it('sets aria-busy and aria-hidden on decorative rows', () => {
    const { container } = render(<SidebarSkeleton />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-busy')).toBe('true');
    const rows = container.querySelectorAll('.sidebar-skeleton-row');
    expect(rows.length).toBeGreaterThanOrEqual(7); // 1 header + 6 module rows
    rows.forEach((row) => {
      expect(row.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('applies decreasing opacity to each module row', () => {
    const { container } = render(<SidebarSkeleton />);
    const moduleRows = container.querySelectorAll(
      '[data-role="sidebar-skeleton-module"]',
    );
    const opacities = Array.from(moduleRows).map((el) =>
      Number.parseFloat((el as HTMLElement).style.opacity || '1'),
    );
    for (let i = 1; i < opacities.length; i += 1) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/sidebar-skeleton.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/sidebar-skeleton.tsx`:

```tsx
import { motion, useReducedMotion } from 'motion/react';
import { readSidebarMotionTokens } from '@/lib/sidebar-motion';

const MODULE_ROW_COUNT = 6;
const NESTED_LESSONS_BY_INDEX: Record<number, number> = { 2: 2, 3: 2 };
const OPACITY_STEP_FALLBACK = 0.12;

function rowOpacity(index: number): number {
  if (typeof window === 'undefined') return 1 - index * OPACITY_STEP_FALLBACK;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--sidebar-skeleton-row-opacity-step');
  const step = Number.parseFloat(raw);
  const safe = Number.isFinite(step) && step > 0 ? step : OPACITY_STEP_FALLBACK;
  return Math.max(0.1, 1 - index * safe);
}

const shimmerAnimate = {
  backgroundPosition: ['0% 0', '-200% 0'] as [string, string],
};

export const SidebarSkeleton = () => {
  const reduced = useReducedMotion();
  const tokens = readSidebarMotionTokens();
  const transition = reduced
    ? { duration: 0 }
    : {
        duration: tokens.shimmerS,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear' as const,
      };
  const animate = reduced ? undefined : shimmerAnimate;

  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-sidebar-row-gap px-sidebar-row-inline py-sidebar-row-block"
    >
      <motion.div
        aria-hidden="true"
        className="sidebar-skeleton-row"
        style={{ blockSize: 'var(--block-size-sidebar-skeleton-header)' }}
        animate={animate}
        transition={transition}
      />
      {Array.from({ length: MODULE_ROW_COUNT }, (_, moduleIndex) => (
        <div
          key={moduleIndex}
          className="flex flex-col gap-sidebar-row-gap"
          style={{ opacity: rowOpacity(moduleIndex) }}
          data-role="sidebar-skeleton-module"
        >
          <motion.div
            aria-hidden="true"
            className="sidebar-skeleton-row"
            style={{ blockSize: 'var(--block-size-sidebar-skeleton-module)' }}
            animate={animate}
            transition={transition}
          />
          {Array.from(
            { length: NESTED_LESSONS_BY_INDEX[moduleIndex] ?? 0 },
            (_, lessonIndex) => (
              <motion.div
                key={lessonIndex}
                aria-hidden="true"
                className="sidebar-skeleton-row ms-sidebar-lesson-indent"
                style={{
                  blockSize: 'var(--block-size-sidebar-skeleton-lesson)',
                }}
                animate={animate}
                transition={transition}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/sidebar-skeleton.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/sidebar-skeleton.tsx src/components/sidebar/__tests__/sidebar-skeleton.test.tsx
git commit -m "feat(sidebar): add pure SidebarSkeleton with motion shimmer"
```

---

## Task 7: `CourseSidebarHeader` (pure)

**Files:**

- Create: `src/components/sidebar/course-sidebar-header.tsx`
- Test: `src/components/sidebar/__tests__/course-sidebar-header.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/course-sidebar-header.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseSidebarHeader } from '../course-sidebar-header';

describe('CourseSidebarHeader', () => {
  it('renders the title and subtitle with module/lesson counts', () => {
    render(
      <CourseSidebarHeader
        title="3D Airmanship"
        moduleCount={12}
        lessonCount={87}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('12 modules · 87 lessons')).toBeDefined();
  });

  it('singularises the counts correctly', () => {
    render(
      <CourseSidebarHeader title="Tiny" moduleCount={1} lessonCount={1} />,
    );
    expect(screen.getByText('1 module · 1 lesson')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar-header.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/course-sidebar-header.tsx`:

```tsx
type CourseSidebarHeaderProps = {
  title: string;
  moduleCount: number;
  lessonCount: number;
};

const plural = (n: number, singular: string) =>
  `${n} ${singular}${n === 1 ? '' : 's'}`;

export const CourseSidebarHeader = ({
  title,
  moduleCount,
  lessonCount,
}: CourseSidebarHeaderProps) => (
  <header className="flex flex-col gap-sidebar-row-gap px-sidebar-row-inline py-sidebar-row-block">
    <h2 className="text-sm font-semibold text-gray-12 truncate">{title}</h2>
    <p className="text-xs text-gray-11">
      {plural(moduleCount, 'module')} · {plural(lessonCount, 'lesson')}
    </p>
  </header>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar-header.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/course-sidebar-header.tsx src/components/sidebar/__tests__/course-sidebar-header.test.tsx
git commit -m "feat(sidebar): add pure CourseSidebarHeader with title and counts"
```

---

## Task 8: `LessonLink` (pure)

**Files:**

- Create: `src/components/sidebar/lesson-link.tsx`
- Test: `src/components/sidebar/__tests__/lesson-link.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/lesson-link.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonLink } from '../lesson-link';

function renderInRouter(ui: React.ReactNode, initialPath = '/') {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(<RouterProvider router={router} />);
}

const lesson = { slug: 'pitch-and-roll', name: 'Pitch and roll' };

describe('LessonLink', () => {
  it('renders a link to the lesson route', () => {
    renderInRouter(
      <LessonLink
        moduleSlug="fundamentals"
        lesson={lesson}
        isActive={false}
      />,
    );
    const link = screen.getByRole('link', { name: 'Pitch and roll' });
    expect(link.getAttribute('href')).toBe(
      '/modules/fundamentals/lessons/pitch-and-roll',
    );
    expect(link.hasAttribute('aria-current')).toBe(false);
    expect(link.className).not.toContain('sidebar-row-active');
  });

  it('marks the link as current and applies the active class when isActive is true', () => {
    renderInRouter(
      <LessonLink moduleSlug="fundamentals" lesson={lesson} isActive />,
    );
    const link = screen.getByRole('link', { name: 'Pitch and roll' });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('sidebar-row-active');
  });

  it('always applies the focus-ring class', () => {
    renderInRouter(
      <LessonLink
        moduleSlug="fundamentals"
        lesson={lesson}
        isActive={false}
      />,
    );
    const link = screen.getByRole('link', { name: 'Pitch and roll' });
    expect(link.className).toContain('sidebar-focus-ring');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/lesson-link.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/lesson-link.tsx`:

```tsx
import { Link } from '@tanstack/react-router';

type LessonLike = { slug: string; name: string };

type LessonLinkProps = {
  moduleSlug: string;
  lesson: LessonLike;
  isActive: boolean;
};

export const LessonLink = ({
  moduleSlug,
  lesson,
  isActive,
}: LessonLinkProps) => {
  const classes = [
    'sidebar-focus-ring',
    'flex items-center gap-2',
    'ps-sidebar-lesson-indent pe-sidebar-row-inline py-sidebar-row-block',
    'text-sm truncate',
    'rounded-sidebar-row',
    'hover:bg-gray-a3 hover:text-gray-12',
    isActive ? 'sidebar-row-active' : 'text-gray-11',
  ].join(' ');

  return (
    <Link
      to="/modules/$moduleSlug/lessons/$lessonSlug"
      params={{ moduleSlug, lessonSlug: lesson.slug }}
      aria-current={isActive ? 'page' : undefined}
      className={classes}
    >
      <span className="truncate">{lesson.name}</span>
    </Link>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/lesson-link.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/lesson-link.tsx src/components/sidebar/__tests__/lesson-link.test.tsx
git commit -m "feat(sidebar): add pure LessonLink with active state"
```

---

## Task 9: `LessonList` (pure)

**Files:**

- Create: `src/components/sidebar/lesson-list.tsx`
- Test: `src/components/sidebar/__tests__/lesson-list.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/lesson-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonList } from '../lesson-list';

function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

const lessons = [
  { slug: 'a', name: 'Lesson A' },
  { slug: 'b', name: 'Lesson B' },
  { slug: 'c', name: 'Lesson C' },
];

describe('LessonList', () => {
  it('renders one LessonLink per lesson in a single <ul>', () => {
    renderInRouter(
      <LessonList
        moduleSlug="fundamentals"
        lessons={lessons}
        activeLessonSlug={null}
      />,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks only the matching lesson as active', () => {
    renderInRouter(
      <LessonList
        moduleSlug="fundamentals"
        lessons={lessons}
        activeLessonSlug="b"
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
    expect(links[2].getAttribute('aria-current')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/lesson-list.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/lesson-list.tsx`:

```tsx
import { LessonLink } from './lesson-link';

type LessonLike = { slug: string; name: string };

type LessonListProps = {
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
};

export const LessonList = ({
  moduleSlug,
  lessons,
  activeLessonSlug,
}: LessonListProps) => (
  <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
    {lessons.map((lesson) => (
      <li key={lesson.slug}>
        <LessonLink
          moduleSlug={moduleSlug}
          lesson={lesson}
          isActive={lesson.slug === activeLessonSlug}
        />
      </li>
    ))}
  </ul>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/lesson-list.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/lesson-list.tsx src/components/sidebar/__tests__/lesson-list.test.tsx
git commit -m "feat(sidebar): add pure LessonList"
```

---

## Task 10: `ModuleItem` (pure)

**Files:**

- Create: `src/components/sidebar/module-item.tsx`
- Test: `src/components/sidebar/__tests__/module-item.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/module-item.test.tsx`:

```tsx
// @vitest-environment jsdom
import { Accordion } from '@base-ui/react/accordion';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModuleItem } from '../module-item';

const module = {
  id: 1,
  name: 'Fundamentals',
  slug: 'fundamentals',
  lessons: [
    { slug: 'pitch', name: 'Pitch' },
    { slug: 'roll', name: 'Roll' },
  ],
};

function renderInside(rank: number, activeLessonSlug: string | null) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <Accordion.Root>
        <ModuleItem
          module={module}
          rank={rank}
          activeLessonSlug={activeLessonSlug}
        />
      </Accordion.Root>
    ),
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('ModuleItem', () => {
  it('renders a trigger with zero-padded rank and module name', () => {
    renderInside(3, null);
    const trigger = screen.getByRole('button', { name: /Fundamentals/ });
    expect(trigger.textContent).toContain('03');
    expect(trigger.textContent).toContain('Fundamentals');
  });

  it('applies the focus-ring class on the trigger', () => {
    renderInside(1, null);
    const trigger = screen.getByRole('button', { name: /Fundamentals/ });
    expect(trigger.className).toContain('sidebar-focus-ring');
  });

  it('includes a chevron with the sidebar-chevron class', () => {
    const { container } = renderInside(1, null);
    expect(container.querySelector('.sidebar-chevron')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/module-item.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/module-item.tsx`:

```tsx
import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { LessonList } from './lesson-list';

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type ModuleItemProps = {
  module: ModuleLike;
  rank: number;
  activeLessonSlug: string | null;
};

const TRIGGER_CLASSES = [
  'sidebar-focus-ring',
  'flex items-center gap-2 w-full',
  'px-sidebar-row-inline py-sidebar-row-block',
  'text-start text-sm text-gray-12',
  'rounded-sidebar-row',
  'hover:bg-gray-a3',
].join(' ');

export const ModuleItem = ({
  module,
  rank,
  activeLessonSlug,
}: ModuleItemProps) => (
  <Accordion.Item value={module.slug} className="flex flex-col">
    <Accordion.Header>
      <Accordion.Trigger className={TRIGGER_CLASSES}>
        <span className="tabular-nums text-gray-10 text-xs font-medium">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="flex-1 truncate">{module.name}</span>
        <ChevronDown className="sidebar-chevron size-4" aria-hidden="true" />
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Panel className="overflow-hidden">
      <LessonList
        moduleSlug={module.slug}
        lessons={module.lessons}
        activeLessonSlug={activeLessonSlug}
      />
    </Accordion.Panel>
  </Accordion.Item>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/module-item.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/module-item.tsx src/components/sidebar/__tests__/module-item.test.tsx
git commit -m "feat(sidebar): add pure ModuleItem (Base UI Accordion.Item)"
```

---

## Task 11: `ModuleAccordion` (pure)

**Files:**

- Create: `src/components/sidebar/module-accordion.tsx`
- Test: `src/components/sidebar/__tests__/module-accordion.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/module-accordion.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleAccordion } from '../module-accordion';

const modules = [
  {
    id: 1,
    name: 'Fundamentals',
    slug: 'fundamentals',
    lessons: [{ slug: 'pitch', name: 'Pitch' }],
  },
  {
    id: 2,
    name: 'Intermediate',
    slug: 'intermediate',
    lessons: [{ slug: 'yaw', name: 'Yaw' }],
  },
];

function renderIn(
  openModuleSlug: string | null,
  onOpenChange: (slug: string | null) => void,
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ModuleAccordion
        modules={modules}
        openModuleSlug={openModuleSlug}
        onOpenChange={onOpenChange}
        activeLessonSlug={null}
      />
    ),
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('ModuleAccordion', () => {
  it('renders one ModuleItem per module', () => {
    renderIn(null, () => {});
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('calls onOpenChange with the clicked slug when a closed item is opened', () => {
    const onOpenChange = vi.fn();
    renderIn(null, onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: /Fundamentals/ }));
    expect(onOpenChange).toHaveBeenCalledWith('fundamentals');
  });

  it('calls onOpenChange with null when the open item is clicked again', () => {
    const onOpenChange = vi.fn();
    renderIn('fundamentals', onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: /Fundamentals/ }));
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/module-accordion.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/module-accordion.tsx`:

```tsx
import { Accordion } from '@base-ui/react/accordion';
import { ModuleItem } from './module-item';

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type ModuleAccordionProps = {
  modules: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
};

export const ModuleAccordion = ({
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
}: ModuleAccordionProps) => (
  <Accordion.Root
    value={openModuleSlug ? [openModuleSlug] : []}
    onValueChange={(values) =>
      onOpenChange(
        typeof values[0] === 'string' ? (values[0] as string) : null,
      )
    }
    className="flex flex-col gap-sidebar-row-gap"
  >
    {modules.map((module, index) => (
      <ModuleItem
        key={module.slug}
        module={module}
        rank={index + 1}
        activeLessonSlug={activeLessonSlug}
      />
    ))}
  </Accordion.Root>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/module-accordion.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/module-accordion.tsx src/components/sidebar/__tests__/module-accordion.test.tsx
git commit -m "feat(sidebar): add pure ModuleAccordion (Base UI Accordion.Root)"
```

---

## Task 12: `CourseSidebar` (pure — status branch + motion stage)

**Files:**

- Create: `src/components/sidebar/course-sidebar.tsx`
- Test: `src/components/sidebar/__tests__/course-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/course-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseSidebar } from '../course-sidebar';

const modules = [
  {
    id: 1,
    name: 'Fundamentals',
    slug: 'fundamentals',
    lessons: [{ slug: 'pitch', name: 'Pitch' }],
  },
];

type Props = Parameters<typeof CourseSidebar>[0];

function renderStatus(props: Props) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CourseSidebar {...props} />,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('CourseSidebar', () => {
  it('renders a nav landmark with the "Course contents" label', () => {
    renderStatus({
      status: 'loading',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(
      screen.getByRole('navigation', { name: 'Course contents' }),
    ).toBeDefined();
  });

  it('renders the skeleton when status is "loading"', () => {
    const { container } = renderStatus({
      status: 'loading',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when status is "error"', () => {
    renderStatus({
      status: 'error',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't load the course",
    );
  });

  it('renders header + accordion when status is "ready"', () => {
    renderStatus({
      status: 'ready',
      title: '3D Airmanship',
      moduleCount: 1,
      lessonCount: 1,
      modules,
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByRole('button', { name: /Fundamentals/ })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/sidebar/course-sidebar.tsx`:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { readSidebarMotionTokens } from '@/lib/sidebar-motion';
import { CourseSidebarHeader } from './course-sidebar-header';
import { ModuleAccordion } from './module-accordion';
import { SidebarError } from './sidebar-error';
import { SidebarSkeleton } from './sidebar-skeleton';

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type CourseSidebarProps = {
  status: 'loading' | 'error' | 'ready';
  title?: string;
  moduleCount?: number;
  lessonCount?: number;
  modules?: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
};

const STAGE_CLASSES = 'flex flex-col gap-sidebar-section-gap min-h-0';

export const CourseSidebar = ({
  status,
  title,
  moduleCount,
  lessonCount,
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
}: CourseSidebarProps) => {
  const reduced = useReducedMotion();
  const tokens = readSidebarMotionTokens();
  const revealTransition = reduced
    ? { duration: 0 }
    : { duration: tokens.revealS, ease: tokens.ease };
  const initialFilter = reduced
    ? 'blur(0px)'
    : 'blur(var(--blur-sidebar-reveal))';

  return (
    <nav aria-label="Course contents" className="h-full min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        {status === 'loading' ? (
          <motion.div
            key="loading"
            className={STAGE_CLASSES}
            exit={{ opacity: 0 }}
            transition={revealTransition}
          >
            <SidebarSkeleton />
          </motion.div>
        ) : status === 'error' ? (
          <motion.div
            key="error"
            className={STAGE_CLASSES}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={revealTransition}
          >
            <SidebarError />
          </motion.div>
        ) : (
          <motion.div
            key="ready"
            className={STAGE_CLASSES}
            initial={{ opacity: 0, filter: initialFilter }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={revealTransition}
          >
            <CourseSidebarHeader
              title={title ?? ''}
              moduleCount={moduleCount ?? 0}
              lessonCount={lessonCount ?? 0}
            />
            <ModuleAccordion
              modules={modules ?? []}
              openModuleSlug={openModuleSlug}
              onOpenChange={onOpenChange}
              activeLessonSlug={activeLessonSlug}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/course-sidebar.tsx src/components/sidebar/__tests__/course-sidebar.test.tsx
git commit -m "feat(sidebar): add pure CourseSidebar status branch with motion stage"
```

---

## Task 13: `CourseSidebarWrapper` (the one wrapper)

**Files:**

- Create: `src/components/sidebar/course-sidebar-wrapper.tsx`
- Test: `src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/data/use-course-details', () => ({
  useCourseDetails: vi.fn(),
}));

import { useCourseDetails } from '@/hooks/data/use-course-details';
import { CourseSidebarWrapper } from '../course-sidebar-wrapper';

const mockedHook = vi.mocked(useCourseDetails);

const fakeCourse = {
  id: 1,
  slug: '3d-airmanship',
  name: '3D Airmanship',
  modules: [
    {
      id: 1,
      slug: 'fundamentals',
      name: 'Fundamentals',
      lessons: [{ slug: 'pitch', name: 'Pitch' }],
    },
    {
      id: 2,
      slug: 'intermediate',
      name: 'Intermediate',
      lessons: [
        { slug: 'yaw', name: 'Yaw' },
        { slug: 'roll', name: 'Roll' },
      ],
    },
  ],
};

function renderAt(path: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CourseSidebarWrapper />,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => <CourseSidebarWrapper />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('CourseSidebarWrapper', () => {
  it('renders the skeleton while loading', () => {
    mockedHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    const { container } = renderAt('/');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when the query errors', () => {
    mockedHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useCourseDetails>);
    renderAt('/');
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders the error when data resolves to null', () => {
    mockedHook.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    renderAt('/');
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders header + modules when ready and marks the active lesson from the URL', () => {
    mockedHook.mockReturnValue({
      data: fakeCourse,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    renderAt('/modules/intermediate/lessons/yaw');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('2 modules · 3 lessons')).toBeDefined();
    const yawLink = screen.getByRole('link', { name: 'Yaw' });
    expect(yawLink.getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the wrapper**

Create `src/components/sidebar/course-sidebar-wrapper.tsx`:

```tsx
import { useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useMemo } from 'react';
import { openModuleSlugAtom } from '@/atoms/sidebar';
import { useCourseDetails } from '@/hooks/data/use-course-details';
import { CourseSidebar } from './course-sidebar';

const COURSE_SLUG = '3d-airmanship';

export const CourseSidebarWrapper = () => {
  const { data, isLoading, isError } = useCourseDetails(COURSE_SLUG);
  const params = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);

  const derived = useMemo(() => {
    if (isLoading) return { status: 'loading' as const };
    if (isError || data == null) return { status: 'error' as const };
    const moduleCount = data.modules.length;
    const lessonCount = data.modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0,
    );
    return {
      status: 'ready' as const,
      title: data.name,
      moduleCount,
      lessonCount,
      modules: data.modules,
    };
  }, [data, isError, isLoading]);

  if (derived.status === 'loading' || derived.status === 'error') {
    return (
      <CourseSidebar
        status={derived.status}
        openModuleSlug={openModuleSlug}
        onOpenChange={setOpenModuleSlug}
        activeLessonSlug={null}
      />
    );
  }

  return (
    <CourseSidebar
      status="ready"
      title={derived.title}
      moduleCount={derived.moduleCount}
      lessonCount={derived.lessonCount}
      modules={derived.modules}
      openModuleSlug={openModuleSlug}
      onOpenChange={setOpenModuleSlug}
      activeLessonSlug={params.lessonSlug ?? null}
    />
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/course-sidebar-wrapper.tsx src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx
git commit -m "feat(sidebar): add CourseSidebarWrapper (only stateful component)"
```

---

## Task 14: Placeholder lesson route

**Files:**

- Create: `src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx`
- Test: `src/routes/__tests__/modules.lessons.test.tsx`
- Modify: `src/routeTree.gen.ts` (auto-generated; do not edit by hand)

- [ ] **Step 1: Write the failing test**

Create `src/routes/__tests__/modules.lessons.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LessonPlaceholder } from '../modules.$moduleSlug.lessons.$lessonSlug';

vi.mock('@/hooks/data/use-course-details', () => ({
  useCourseDetails: () =>
    ({ data: null, isLoading: false, isError: false }) as unknown,
}));

function renderAt(path: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: function LessonRoute() {
      const { moduleSlug, lessonSlug } = lessonRoute.useParams();
      return (
        <LessonPlaceholder
          moduleSlug={moduleSlug}
          lessonSlug={lessonSlug}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([lessonRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('LessonPlaceholder', () => {
  it('renders the moduleSlug and lessonSlug from the URL', () => {
    renderAt('/modules/fundamentals/lessons/pitch');
    expect(screen.getByText(/Module: fundamentals/)).toBeDefined();
    expect(screen.getByText(/Lesson: pitch/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run src/routes/__tests__/modules.lessons.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route file**

Create `src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { CourseSidebarWrapper } from '@/components/sidebar/course-sidebar-wrapper';
import { appTitle } from '@/styles/theme.generated';

export const Route = createFileRoute(
  '/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

export type LessonPlaceholderProps = {
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonPlaceholder = ({
  moduleSlug,
  lessonSlug,
}: LessonPlaceholderProps) => (
  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-12">
    <p>
      Module: <strong>{moduleSlug}</strong>
    </p>
    <p>
      Lesson: <strong>{lessonSlug}</strong>
    </p>
  </div>
);

function LessonRoute() {
  const { moduleSlug, lessonSlug } = Route.useParams();
  return (
    <AppShell
      header={<div className="flex items-center gap-3 h-full ps-4 pe-4" />}
      aside={<CourseSidebarWrapper />}
      main={
        <LessonPlaceholder moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      }
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

- [ ] **Step 4: Regenerate the route tree**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

The Vite dev server (if running) auto-regenerates `routeTree.gen.ts`. If running tests fails due to stale route types, run `pnpm dev` for ~2 seconds and kill it to force regeneration.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/routes/__tests__/modules.lessons.test.tsx
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx src/routes/__tests__/modules.lessons.test.tsx src/routeTree.gen.ts
git commit -m "feat(routes): add placeholder lesson route under /modules/\$moduleSlug/lessons/\$lessonSlug"
```

---

## Task 15: Wire `<CourseSidebarWrapper />` into `/`

**Files:**

- Modify: `src/routes/index.tsx`

- [ ] **Step 1: Replace the empty `aside`**

Open `src/routes/index.tsx` and replace the body so the whole file reads:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { CourseSidebarWrapper } from '@/components/sidebar/course-sidebar-wrapper';
import { appTitle } from '@/styles/theme.generated';

export const Route = createFileRoute('/')({ component: App });

function App() {
  return (
    <AppShell
      header={<div className="flex items-center gap-3 h-full ps-4 pe-4" />}
      aside={<CourseSidebarWrapper />}
      main={null}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Run the whole test suite**

Run:

```bash
pnpm exec vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Type-check**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Lint/format check**

Run:

```bash
pnpm check
```

Expected: no Biome errors. If there are formatting diffs only, run `pnpm exec biome check --write` and commit the change with this task's commit.

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(routes): mount CourseSidebarWrapper in the root route aside"
```

---

## Task 16: Manual verification in the browser

**Files:** None (verification only).

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm dev
```

Open `http://localhost:3000` in a Chromium-based browser ≥ 768px wide (below that the unsupported-screen overlay hides the app-shell).

- [ ] **Step 2: Verify the loading state**

Hard-reload and throttle the network (DevTools → Network → Slow 3G) so the course-details request takes ≥ 1s. Confirm:

- Shimmer skeleton appears in the `aside` with a header row and 6 module rows.
- Row opacity decreases visibly down the list.
- Shimmer gradient animates horizontally.
- No console errors.

- [ ] **Step 3: Verify the reveal transition**

Turn throttling off and hard-reload. Confirm:

- Content replaces the skeleton.
- Real content enters with a brief blur fade-in (blur → clear, ~320ms).
- Course title `3D Airmanship` and the `N modules · M lessons` subtitle appear.

- [ ] **Step 4: Verify accordion interaction**

- Click a module trigger — its panel opens.
- Click a different module — previous closes, new one opens (single-open).
- Click the open module — it closes.
- `Tab` through triggers and lesson links: each shows a 2px accent outline with a 2px offset.
- Arrow keys on a focused trigger move focus across module triggers (Base UI default).

- [ ] **Step 5: Verify lesson navigation + active state**

- Click a lesson. The URL changes to `/modules/<moduleSlug>/lessons/<lessonSlug>`.
- The placeholder main area shows `Module: …` and `Lesson: …`.
- The clicked lesson has the active tint (accent-3 background, accent-7 start border) and `aria-current="page"` (inspect element).
- Navigate to a different lesson; the active state follows.

- [ ] **Step 6: Verify reduced-motion behaviour**

In DevTools → Rendering, enable `prefers-reduced-motion: reduce`. Reload. Confirm:

- Skeleton shows a static tint (no moving gradient).
- Reveal skips the blur fade (instant swap).
- Chevron rotation is immediate.

- [ ] **Step 7: Kill the dev server**

Stop `pnpm dev`. No code changes, no commit.

---

## Self-review (done before handoff)

**Spec coverage:**

| Spec section | Implementing task(s) |
| --- | --- |
| Wrapper-vs-pure split | Tasks 5–13 |
| Jotai `openModuleSlugAtom` | Task 3 |
| Motion token bridge | Task 4 |
| Sidebar tokens + component classes | Task 2 |
| `[NN] Module name [chevron]` row | Task 10 |
| Single-open accordion, controlled value | Task 11 |
| Lesson link + active state + `aria-current` | Task 8 |
| Skeleton (staggered opacity, shimmer, reduced-motion) | Task 6 |
| Blur-to-focus reveal | Task 12 |
| `CourseSidebarHeader` with counts | Task 7 |
| `SidebarError` | Task 5 |
| Lesson route `/modules/$moduleSlug/lessons/$lessonSlug` | Task 14 |
| Wire wrapper into `/` | Task 15 |
| Focus-visible accent outline | Task 2 (CSS) + applied in Tasks 8 & 10 |
| No arbitrary Tailwind values | Enforced via Task 2 tokens + code in Tasks 5–13 |
| Logical properties everywhere | Applied in every component (Tasks 5–15) |
| Manual verification | Task 16 |

**Placeholder scan:** None — every step has concrete code or a concrete command with expected output.

**Type consistency:** `ModuleLike`/`LessonLike` shapes are re-declared inside each pure component that needs them; they all agree on `{ slug, name }` for `LessonLike` and `{ id, slug, name, lessons }` for `ModuleLike`. The wrapper passes `data.modules` from `CourseDetails`, whose real modules already satisfy these (plus extra fields we ignore). The atom type `string | null` matches the prop types in `CourseSidebar`, `ModuleAccordion`, and the wrapper.
