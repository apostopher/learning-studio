# Navigation Perceived Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A click on a course card produces visible feedback within one frame and reaches the lesson in well under a second, instead of leaving the learner on an unchanged page for 3–4 seconds.

**Architecture:** Two independent halves. *Feedback* gives the router a `pendingComponent` (without one it never starts its pending timer and keeps the old layout mounted indefinitely) and styles the in-flight `Link`. *Latency* unifies the two QueryClient instances, routes the blocking `beforeLoad` guards through React Query so hover-preload actually warms them, makes the enrollment check lean, and lets cards link straight to the resume lesson so the index-redirect hop disappears.

**Tech Stack:** TanStack Start, TanStack Router, TanStack Query, Drizzle + PostgreSQL, Redis (Upstash), Motion, Tailwind v4, Vitest + Testing Library, Biome.

**Source spec:** `docs/superpowers/specs/2026-07-30-navigation-perceived-performance-design.md`

## Global Constraints

- **TypeScript strict mode.** No `any`, no non-null `!` assertions in new code.
- **CSS logical properties only** — `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`, `inline-size`/`block-size`, `text-start`. Physical properties only where genuinely viewport-tied, with a comment saying why.
- **No `useState`/`useReducer` for shared state** — Jotai for client state, TanStack Query for server state. Local state purely powering an animation is permitted.
- **Component files are kebab-case**, exported component names PascalCase.
- **No `@testing-library/jest-dom`** in this repo. Use `expect(x).toBeDefined()`, `expect(x).not.toBeNull()`, `expect(x.getAttribute('...')).toBe('...')` — never `toBeInTheDocument()`.
- **Tests import via `#/`**, never `@/` — Vitest cannot resolve `@/`.
- **Component tests need `// @vitest-environment jsdom`** as the first line.
- **Never `git add` `CLAUDE.md`, `package.json`, or `src/db/schema.ts`** — they carry unrelated uncommitted user changes. Always stage explicit paths.
- **`defaultPreloadStaleTime: 0` in `src/router.tsx` must not be changed.** It is required by the `@tanstack/react-router-ssr-query` integration so React Query owns freshness.
- Run `pnpm check` (Biome) before each commit.

**Note on test runs:** Vitest prints `close timed out after 10000ms / something prevents Vite server from exiting` after the summary. This is a known pre-existing teardown quirk, not a failure. Judge results by the `Test Files` / `Tests` summary lines.

---

### Task 1: AppShellSkeleton and route pending components

Gives the router the one thing it is missing. Confirmed from `packages/router-core/src/load-matches.ts` (`setupPendingTimeout`): the pending timer only starts when `(route.options.pendingComponent ?? router.options.defaultPendingComponent)` is truthy — otherwise the previous layout stays mounted until loaders finish. `beforeLoad` *is* covered by the pending state, so this alone fixes the dead click.

**Files:**
- Create: `src/components/app-shell-footer.tsx`
- Create: `src/components/app-shell-skeleton.tsx`
- Create: `src/components/__tests__/app-shell-skeleton.test.tsx`
- Modify: `src/components/lesson-main/index.ts` (export `LessonSkeleton`)
- Modify: `src/routes/_authed/course.$courseSlug.tsx:18-35` and `:144-148`
- Modify: `src/routes/_authed/course.$courseSlug.index.tsx:23-44`

**Interfaces:**
- Consumes: `AppShell` from `#/components/app-shell`; `SidebarSkeleton` from `#/components/sidebar/sidebar-skeleton`; `LessonSkeleton` from `#/components/lesson-main/parts/lesson-skeleton`; `appTitle` from `#/styles/theme.generated`.
- Produces: `AppShellFooter` (no props), `AppShellSkeleton` (no props), and `LessonSkeleton` re-exported from the `#/components/lesson-main` barrel.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/app-shell-skeleton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellSkeleton } from '../app-shell-skeleton';

describe('AppShellSkeleton', () => {
  it('announces that the course is loading', () => {
    render(<AppShellSkeleton />);
    expect(screen.getByRole('status').textContent).toContain('Loading course');
  });

  it('puts the sidebar skeleton in the complementary landmark', () => {
    render(<AppShellSkeleton />);
    const aside = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(aside.querySelector('.sidebar-skeleton-row')).not.toBeNull();
  });

  it('puts the lesson skeleton in the main landmark', () => {
    render(<AppShellSkeleton />);
    const main = screen.getByRole('main');
    expect(main.querySelector('.lesson-skeleton-player')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/__tests__/app-shell-skeleton.test.tsx`

Expected: FAIL — `Failed to resolve import "../app-shell-skeleton"`.

- [ ] **Step 3: Extract the shared footer**

`CourseLayout` and the skeleton must render an identical footer or the swap will shift layout. Create `src/components/app-shell-footer.tsx`:

```tsx
import { appTitle } from '../styles/theme.generated';

/** The app's standing footer bar. Shared so the loading skeleton and the real
 *  shell cannot drift apart and cause a layout shift on the swap. */
export const AppShellFooter = () => (
  <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
    <span>© {appTitle}</span>
  </div>
);
```

- [ ] **Step 4: Write AppShellSkeleton**

Create `src/components/app-shell-skeleton.tsx`:

```tsx
import { LessonSkeleton } from './lesson-main/parts/lesson-skeleton';
import { SidebarSkeleton } from './sidebar/sidebar-skeleton';
import { AppShell } from './app-shell';
import { AppShellFooter } from './app-shell-footer';

/**
 * What the learner sees while a course route's `beforeLoad` guards resolve.
 *
 * Deliberately the real `AppShell` with skeleton contents rather than a
 * bespoke loading screen: identical grid geometry means the swap to real
 * content shifts nothing. Wired as `pendingComponent` on the course routes,
 * not as `defaultPendingComponent`, because this shell is wrong for /admin
 * and /auth.
 */
export const AppShellSkeleton = () => (
  <AppShell
    aside={<SidebarSkeleton />}
    main={
      <>
        <p className="sr-only" role="status">
          Loading course
        </p>
        <LessonSkeleton />
      </>
    }
    footer={<AppShellFooter />}
  />
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/components/__tests__/app-shell-skeleton.test.tsx`

Expected: PASS (3 tests).

- [ ] **Step 6: Use the shared footer in the real layout**

In `src/routes/_authed/course.$courseSlug.tsx`, replace the inline footer JSX (currently lines 144–148) with `footer={<AppShellFooter />}` and add `import { AppShellFooter } from '../../components/app-shell-footer';`. Remove the now-unused `appTitle` import.

- [ ] **Step 7: Run the existing shell tests to confirm no regression**

Run: `pnpm vitest run src/components/__tests__/app-shell.test.tsx src/components/sidebar/__tests__/sidebar-skeleton.test.tsx`

Expected: PASS (6 tests).

- [ ] **Step 8: Export LessonSkeleton from the barrel**

Add to `src/components/lesson-main/index.ts`:

```ts
export { LessonSkeleton } from './parts/lesson-skeleton';
```

- [ ] **Step 9: Wire the pending components onto the routes**

In `src/routes/_authed/course.$courseSlug.tsx`, add to the `createFileRoute` options object alongside `beforeLoad` and `component`:

```ts
  // Without a pendingComponent the router never starts its pending timer and
  // leaves the PREVIOUS page mounted for the whole of beforeLoad — which is
  // why clicking a course card used to look like nothing happened.
  // 120ms is below the ~200ms threshold where a click starts to feel ignored,
  // but above one frame, so a cache-warm navigation skips the skeleton
  // entirely. pendingMinMs keeps it up long enough to read as progress
  // rather than a flicker.
  pendingComponent: AppShellSkeleton,
  pendingMs: 120,
  pendingMinMs: 400,
```

with `import { AppShellSkeleton } from '../../components/app-shell-skeleton';`.

In `src/routes/_authed/course.$courseSlug.index.tsx`, add to its options object:

```ts
  // LessonSkeleton alone, with no AppShell wrapper: by the time this route is
  // pending its parent layout has committed and is already supplying the
  // shell. Rendering another would nest two shells.
  pendingComponent: LessonSkeleton,
  pendingMs: 120,
  pendingMinMs: 400,
```

with `import { LessonSkeleton } from '../../components/lesson-main';`.

- [ ] **Step 10: Verify in the running app**

Route files import server functions and cannot be unit-tested in Vitest, so this step is a manual check — it is the only verification of the wiring, so do not skip it.

1. `pnpm dev`
2. Open `http://localhost:5000/app`
3. DevTools → Network → throttle to **Slow 3G** (this also defeats hover-preload, forcing the pending path)
4. Click a course card **without hovering first**

Expected: the skeleton shell appears almost immediately, then real content replaces it. Confirm the sidebar skeleton and the lesson skeleton both appear, and that nothing jumps position when real content lands.

- [ ] **Step 11: Lint and commit**

```bash
pnpm check
git add src/components/app-shell-skeleton.tsx src/components/app-shell-footer.tsx src/components/__tests__/app-shell-skeleton.test.tsx src/components/lesson-main/index.ts src/routes/_authed/course.\$courseSlug.tsx src/routes/_authed/course.\$courseSlug.index.tsx
git commit -m "feat(nav): show a shell skeleton while course guards resolve

The router only starts its pending timer when a pendingComponent exists;
without one it kept the previous page mounted for the whole of beforeLoad,
so clicking a course card looked like nothing happened."
```

---

### Task 2: Card press feedback and skeleton-to-content crossfade

`Link` already sets `data-transitioning="transitioning"` on itself while its own navigation is in flight and clears it on the router's `onResolved` event (`packages/react-router/src/link.tsx`, `useLinkProps`). It is set inside the guarded click path, so a cmd-click into a new tab does not trigger it, and it clears itself if the navigation is cancelled or redirected. No custom hook is needed — this is pure CSS.

**Files:**
- Modify: `src/styles.css` (append a navigation-feedback block)
- Modify: `src/components/courses/my-courses-page-container.tsx:28` (add a hook class to the grid)
- Modify: `src/components/lesson-main/lesson-main.tsx:113-126`
- Create: `src/components/lesson-main/__tests__/lesson-main-crossfade.test.tsx`

**Interfaces:**
- Consumes: `LessonMainState` from `#/components/lesson-main/types`; `AnimatePresence`, `motion` from `motion/react`.
- Produces: no new exports. `LessonMain`'s public props are unchanged (`{ state: LessonMainState }`).

- [ ] **Step 1: Add the navigation feedback CSS**

Append to `src/styles.css`:

```css
/* ---- Navigation feedback -------------------------------------------------
   TanStack Router's <Link> sets data-transitioning="transitioning" on itself
   while its own navigation is in flight, and clears it on onResolved. That
   gives us a per-link pending state with no JS of our own, and it cannot get
   stuck: a cancelled or redirected navigation clears it too. */

.course-grid a[data-transitioning] {
  transform: scale(0.98);
  /* transform is a visual-axis effect, not a flow-relative one, so scale()
     is correct here rather than a logical property. */
}

/* Dim the cards the learner did NOT click, so the one they did stands out.
   :has() scopes this to the moment a navigation is actually in flight. */
.course-grid:has(a[data-transitioning]) a:not([data-transitioning]) {
  opacity: 0.6;
}

.course-grid a {
  transition:
    transform 150ms ease-out,
    opacity 150ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  /* Keep the opacity signal, drop the movement — reduced motion means
     gentler, not none. */
  .course-grid a {
    transition: opacity 150ms ease-out;
  }
  .course-grid a[data-transitioning] {
    transform: none;
  }
}
```

- [ ] **Step 2: Add the grid hook class**

In `src/components/courses/my-courses-page-container.tsx`, change line 28 from:

```tsx
          <ul className="grid-auto-fit list-none p-0">
```

to:

```tsx
          <ul className="course-grid grid-auto-fit list-none p-0">
```

- [ ] **Step 3: Verify the press feedback in the running app**

CSS driven by a router-owned data attribute cannot be meaningfully unit-tested, so verify manually:

1. `pnpm dev`, open `http://localhost:5000/app`, throttle Network to **Slow 3G**
2. Click a card without hovering first

Expected: the clicked card scales down slightly and the other cards dim, immediately on press. Then confirm cmd-click (or ctrl-click) opens a new tab and leaves **all** cards unstyled.

- [ ] **Step 4: Write the failing crossfade test**

Create `src/components/lesson-main/__tests__/lesson-main-crossfade.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonMain } from '../lesson-main';
import type { LessonMainState } from '../types';

const loading: LessonMainState = { kind: 'course-loading' };
const notFound: LessonMainState = {
  kind: 'not-found',
  lessonSlug: 'missing-lesson',
};

describe('LessonMain crossfade', () => {
  it('renders the skeleton while the course is loading', () => {
    const { container } = render(<LessonMain state={loading} />);
    expect(container.querySelector('.lesson-skeleton-player')).not.toBeNull();
  });

  it('replaces the skeleton with content once loaded', () => {
    const { container, rerender } = render(<LessonMain state={loading} />);
    rerender(<LessonMain state={notFound} />);
    expect(screen.getByText(/missing-lesson/)).toBeDefined();
  });

  it('keys the presence wrapper by state kind so the swap can animate', () => {
    const { container } = render(<LessonMain state={loading} />);
    expect(
      container.querySelector('[data-lesson-main-phase="course-loading"]'),
    ).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run src/components/lesson-main/__tests__/lesson-main-crossfade.test.tsx`

Expected: FAIL on the third test — no element carries `data-lesson-main-phase`. The first two should already pass; that is fine, they are the regression guard proving the crossfade does not break the existing swap.

- [ ] **Step 6: Add the crossfade**

In `src/components/lesson-main/lesson-main.tsx`, add to the imports:

```tsx
import { AnimatePresence, motion } from 'motion/react';
```

Replace the `LessonMain` export (currently lines 113–126) with:

```tsx
/**
 * Crossfade rather than a hard cut on the skeleton→content swap. Opacity only,
 * and deliberately brief: this fires at the exact moment the learner has
 * finished waiting, so a slow transition here would spend the time we just
 * saved. mode="popLayout" lets the incoming content start fading in while the
 * skeleton leaves, instead of queueing behind it the way mode="wait" would.
 *
 * Opacity-only motion is already safe under prefers-reduced-motion (no
 * movement to suppress), so no reduced-motion branch is needed.
 */
export const LessonMain = ({ state }: LessonMainProps) => (
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.div
      key={state.kind}
      data-lesson-main-phase={state.kind}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {state.kind === 'course-loading' ? (
        <LessonSkeleton />
      ) : (
        <article
          className="lesson-main"
          aria-busy={isVideoInFlight(state) ? true : undefined}
        >
          {renderArticleBody(state)}
        </article>
      )}
    </motion.div>
  </AnimatePresence>
);
```

`initial={false}` stops the fade running on first paint, so arriving at an already-cached lesson does not animate in.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run src/components/lesson-main/__tests__/lesson-main-crossfade.test.tsx`

Expected: PASS (3 tests).

- [ ] **Step 8: Run the full lesson-main suite for regressions**

Run: `pnpm vitest run src/components/lesson-main`

Expected: all PASS. The extra wrapper `div` is a new DOM level — if any existing test asserts on `container.firstElementChild` being the `article`, update that assertion to query by class (`container.querySelector('.lesson-main')`) rather than weakening the test.

- [ ] **Step 9: Lint and commit**

```bash
pnpm check
git add src/styles.css src/components/courses/my-courses-page-container.tsx src/components/lesson-main/lesson-main.tsx src/components/lesson-main/__tests__/lesson-main-crossfade.test.tsx
git commit -m "feat(nav): press feedback on course cards and a skeleton crossfade

Uses the data-transitioning attribute Link already sets on itself, so the
per-link pending state needs no JS and cannot get stuck on a cancelled or
modifier-clicked navigation."
```

---

### Task 3: Use one QueryClient, not two

`getContext()` in `src/integrations/tanstack-query/root-provider.tsx:6-9` constructs a **new** `QueryClient` on every call. `getRouter()` calls it once for router context; `TanstackQueryProvider` calls it again for the React tree. The result is two independent caches: `setupRouterSsrQueryIntegration` dehydrates the router's client, but every `useQuery` in the app reads the provider's client and so refetches everything on the client anyway.

This is a pre-existing bug, and Task 4 depends on it: `ensureQueryData` in `beforeLoad` writes to the router's client, and the components that later read the same data must find it there.

**Files:**
- Modify: `src/integrations/tanstack-query/root-provider.tsx:1-31`
- Modify: `src/routes/__root.tsx:76,100`
- Create: `src/integrations/tanstack-query/__tests__/root-provider.test.tsx`

**Interfaces:**
- Consumes: `QueryClient` from `@tanstack/react-query`; `useRouter` from `@tanstack/react-router`.
- Produces: `TanstackQueryProvider` now takes `{ client: QueryClient; children: React.ReactNode }`. `getContext()` is unchanged and still returns `{ queryClient }` — it keeps being called exactly once, in `getRouter()`.

- [ ] **Step 1: Write the failing test**

This asserts the consumer *received* the client — a child `useQuery` resolving from data seeded into the passed client, with no fetch — rather than merely asserting a prop exists.

Create `src/integrations/tanstack-query/__tests__/root-provider.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TanstackQueryProvider from '../root-provider';

describe('TanstackQueryProvider', () => {
  it('serves children from the client it is given, without refetching', async () => {
    const client = new QueryClient();
    client.setQueryData(['seeded'], 'FROM_SEEDED_CLIENT');
    const queryFn = vi.fn(() => Promise.resolve('FROM_NETWORK'));

    const Child = () => {
      const { data } = useQuery({ queryKey: ['seeded'], queryFn });
      return <p>{data}</p>;
    };

    render(
      <TanstackQueryProvider client={client}>
        <Child />
      </TanstackQueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('FROM_SEEDED_CLIENT')).toBeDefined();
    });
    expect(queryFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/integrations/tanstack-query/__tests__/root-provider.test.tsx`

Expected: FAIL — the provider ignores the `client` prop and builds its own, so the seeded data is absent and `queryFn` is called.

- [ ] **Step 3: Make the provider accept a client**

Replace `src/integrations/tanstack-query/root-provider.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { queryClientAtom } from 'jotai-tanstack-query';

/**
 * Called ONCE, by getRouter(), to build the router context.
 *
 * It must stay a factory rather than a module-level singleton: on the server
 * a shared QueryClient would leak one user's cached data into another user's
 * request. The single instance it returns is threaded to the React tree via
 * router context, which is why TanstackQueryProvider takes a client rather
 * than calling this itself.
 */
export function getContext() {
  const queryClient = new QueryClient();
  return { queryClient };
}

function HydrateQueryClient({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  useHydrateAtoms([[queryClientAtom, client]]);
  return <>{children}</>;
}

export default function TanstackQueryProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <Provider>
        <HydrateQueryClient client={client}>{children}</HydrateQueryClient>
      </Provider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/integrations/tanstack-query/__tests__/root-provider.test.tsx`

Expected: PASS (1 test).

- [ ] **Step 5: Pass the router's client from the root route**

In `src/routes/__root.tsx`, add `useRouter` to the existing `@tanstack/react-router` import, then inside the component that renders `<TanstackQueryProvider>` (the one containing lines 75–101), add before its `return`:

```tsx
  // The router's context client, not a fresh one — this is the same instance
  // setupRouterSsrQueryIntegration dehydrates into and that route beforeLoads
  // prime via ensureQueryData. useRouter() rather than Route.useRouteContext()
  // because this component also renders on the SSR shell path.
  const { queryClient } = useRouter().options.context;
```

Change line 76 from `<TanstackQueryProvider>` to `<TanstackQueryProvider client={queryClient}>`. The closing tag on line 100 is unchanged.

- [ ] **Step 6: Type-check and verify in the app**

Run: `pnpm build`

Expected: build succeeds. (`pnpm build` is the only thing that catches server/client import-boundary violations — a type error here means `useRouter().options.context` is not typed as containing `queryClient`; if so, the root route's context interface at `src/routes/__root.tsx:21` already declares it, so check the import.)

Then `pnpm dev`, open `/app`, and open React Query Devtools. Expected: exactly one set of queries, and navigating to a course does **not** refetch data the server already sent.

- [ ] **Step 7: Lint and commit**

```bash
pnpm check
git add src/integrations/tanstack-query/root-provider.tsx src/integrations/tanstack-query/__tests__/root-provider.test.tsx src/routes/__root.tsx
git commit -m "fix(query): thread one QueryClient through router and React tree

getContext() was called twice, so the tree read a different cache than the
one setupRouterSsrQueryIntegration dehydrates into — every useQuery refetched
on the client despite the server having already sent the data."
```

---

### Task 4: Route the blocking guards through React Query

Both course `beforeLoad`s call server functions raw — the one place in the codebase that skips the "React Query for ALL API calls" rule. Wrapping them in `ensureQueryData` means a hover-preload populates the cache and the subsequent click resolves from it with no network at all, and the redirect hop's re-run of the layout guard hits the same cache instead of repeating the query.

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/course-access-queries.ts`
- Create: `src/data-hooks/__tests__/course-access-queries.test.ts`
- Modify: `src/routes/_authed/course.$courseSlug.tsx:19-33`
- Modify: `src/routes/_authed/course.$courseSlug.index.tsx:24-42`

**Interfaces:**
- Consumes: `getMySubscribedSlugs` from `@/lib/course-functions`; `getCourseResumeTarget` from `#/lib/course-resume-functions`; `ResumeTarget` from `#/lib/course-resume`; `dataKeys` from `#/data-hooks/keys`.
- Produces:
  - `dataKeys.subscribedSlugs(): readonly ['user', 'subscribed-slugs']`
  - `dataKeys.courseResume(courseSlug: string): readonly ['course', 'resume', string]`
  - `subscribedSlugsQueryOptions(): { queryKey; queryFn: () => Promise<string[]>; staleTime: number }`
  - `courseResumeQueryOptions(courseSlug: string): { queryKey; queryFn: () => Promise<ResumeTarget>; staleTime: number }`

- [ ] **Step 1: Add the query keys**

In `src/data-hooks/keys.ts`, add these two entries inside the `dataKeys` object:

```ts
  subscribedSlugs: () => ['user', 'subscribed-slugs'] as const,
  courseResume: (courseSlug: string) =>
    ['course', 'resume', courseSlug] as const,
```

- [ ] **Step 2: Write the failing test**

Create `src/data-hooks/__tests__/course-access-queries.test.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMySubscribedSlugs = vi.hoisted(() => vi.fn());
const getCourseResumeTarget = vi.hoisted(() => vi.fn());

vi.mock('@/lib/course-functions', () => ({ getMySubscribedSlugs }));
vi.mock('#/lib/course-resume-functions', () => ({ getCourseResumeTarget }));

const { courseResumeQueryOptions, subscribedSlugsQueryOptions } = await import(
  '../course-access-queries'
);

describe('subscribedSlugsQueryOptions', () => {
  it('serves a second guard from cache instead of calling the server again', async () => {
    getMySubscribedSlugs.mockResolvedValue(['nav-basics']);
    const client = new QueryClient();

    const first = await client.ensureQueryData(subscribedSlugsQueryOptions());
    const second = await client.ensureQueryData(subscribedSlugsQueryOptions());

    expect(first).toEqual(['nav-basics']);
    expect(second).toEqual(['nav-basics']);
    // The redirect hop re-runs the layout guard; that must not re-query.
    expect(getMySubscribedSlugs).toHaveBeenCalledTimes(1);
  });
});

describe('courseResumeQueryOptions', () => {
  it('passes the slug through to the server function as input data', async () => {
    getCourseResumeTarget.mockResolvedValue({
      kind: 'lesson',
      moduleSlug: 'm1',
      lessonSlug: 'l1',
    });
    const client = new QueryClient();

    await client.ensureQueryData(courseResumeQueryOptions('nav-basics'));

    expect(getCourseResumeTarget).toHaveBeenCalledWith({
      data: { courseSlug: 'nav-basics' },
    });
  });

  it('caches per slug, not globally', async () => {
    getCourseResumeTarget.mockResolvedValue({
      kind: 'none',
      reason: 'no-lessons',
    });
    const client = new QueryClient();

    await client.ensureQueryData(courseResumeQueryOptions('course-a'));
    await client.ensureQueryData(courseResumeQueryOptions('course-b'));

    expect(getCourseResumeTarget).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/data-hooks/__tests__/course-access-queries.test.ts`

Expected: FAIL — `Cannot find module '../course-access-queries'`.

- [ ] **Step 4: Write the query options**

Create `src/data-hooks/course-access-queries.ts`:

```ts
import type { ResumeTarget } from '#/lib/course-resume';
import { getCourseResumeTarget } from '#/lib/course-resume-functions';
import { getMySubscribedSlugs } from '@/lib/course-functions';
import { dataKeys } from './keys';

/**
 * The two blocking guards on the course routes, expressed as query options so
 * `beforeLoad` can prime them via `ensureQueryData`.
 *
 * This is what makes `defaultPreload: 'intent'` pay off. The router's own
 * preload cache is deliberately disabled (`defaultPreloadStaleTime: 0`, which
 * the SSR-Query integration requires), so a hover-preload only helps if the
 * work lands in a cache React Query owns — which is exactly this one.
 */

/**
 * Slugs the signed-in learner is subscribed to.
 *
 * A list rather than a per-slug check because one cache entry then serves
 * every card on the grid. 5 minutes because enrollment changes rarely, and a
 * stale entry cannot grant access it should not: the list is derived from the
 * session on the server on every real fetch, and the worst a stale positive
 * achieves is letting a just-unenrolled learner reach a course page whose own
 * data fetches will fail.
 */
export const subscribedSlugsQueryOptions = () => ({
  queryKey: dataKeys.subscribedSlugs(),
  queryFn: (): Promise<string[]> => getMySubscribedSlugs(),
  staleTime: 5 * 60_000,
});

/**
 * Where `/course/$courseSlug` should send this learner.
 *
 * 30s: long enough that a hover-preload survives to the click, short enough
 * that it re-resolves within a single lesson. Keyed per slug so two courses
 * never share an answer.
 */
export const courseResumeQueryOptions = (courseSlug: string) => ({
  queryKey: dataKeys.courseResume(courseSlug),
  queryFn: (): Promise<ResumeTarget> =>
    getCourseResumeTarget({ data: { courseSlug } }),
  staleTime: 30_000,
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/data-hooks/__tests__/course-access-queries.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 6: Use the query options in the layout guard**

In `src/routes/_authed/course.$courseSlug.tsx`, change the `beforeLoad` signature to take `context` and prime through the cache. Replace lines 19–20:

```ts
  beforeLoad: async ({ context, params }) => {
    const slugs = await context.queryClient.ensureQueryData(
      subscribedSlugsQueryOptions(),
    );
```

Leave the existing `if (!slugs.includes(...)) throw redirect(...)` block and its comment exactly as they are. Replace the `getMySubscribedSlugs` import with:

```ts
import { subscribedSlugsQueryOptions } from '#/data-hooks/course-access-queries';
```

- [ ] **Step 7: Use the query options in the index guard**

In `src/routes/_authed/course.$courseSlug.index.tsx`, replace lines 24–27:

```ts
  beforeLoad: async ({ context, params }) => {
    const resume = await context.queryClient.ensureQueryData(
      courseResumeQueryOptions(params.courseSlug),
    );
```

Leave the rest of the handler (the `if (resume.kind === 'lesson')` redirect and `return { resume }`) unchanged. Replace the `getCourseResumeTarget` import with:

```ts
import { courseResumeQueryOptions } from '#/data-hooks/course-access-queries';
```

- [ ] **Step 8: Build and verify the preload pays off**

Run: `pnpm build`

Expected: succeeds. A failure naming a server-only module means an import boundary was crossed — `course-access-queries.ts` must import from `#/lib/course-resume-functions` and `@/lib/course-functions` (the `-functions.ts` modules, which are client-reachable), never from `#/db/*`.

Then `pnpm dev`, open `/app`, DevTools → Network:
1. **Hover** a course card for ~1s, then click it. Expected: no new request for the guards on click — they were preloaded — and the page changes near-instantly with no skeleton.
2. Reload, then click a card **without hovering**. Expected: the skeleton appears, then content. Fewer guard requests than before, because the redirect hop now reuses the cached slug list.

- [ ] **Step 9: Lint and commit**

```bash
pnpm check
git add src/data-hooks/keys.ts src/data-hooks/course-access-queries.ts src/data-hooks/__tests__/course-access-queries.test.ts src/routes/_authed/course.\$courseSlug.tsx src/routes/_authed/course.\$courseSlug.index.tsx
git commit -m "perf(nav): prime course guards through React Query

beforeLoad called server fns raw, so hover-preloading threw its work away and
the post-redirect re-run repeated the subscription query. Both now resolve
from the Query cache."
```

---

### Task 5: Make the enrollment check lean

`getMySubscribedSlugs` calls `getMyCourses()` — the full multi-join aggregate over every module, lesson and video-progress row — then discards everything except `.map(c => c.slug)`. Task 4 caches the result, but the cold call still runs that query on the critical path.

**Files:**
- Modify: `src/db/course.ts` (add `getSubscribedCourseSlugs`)
- Modify: `src/lib/course-functions.ts:14-22`

**Interfaces:**
- Consumes: `db` from `@/db`; `coursesTable`, `courseSubscriptionsTable` from `@/db/schema` (both already imported at the top of `course.ts`); `asc`, `eq` from `drizzle-orm`.
- Produces: `getSubscribedCourseSlugs(userId: string): Promise<string[]>` exported from `#/db/course`.

> **No unit test for this task, deliberately.** `src/db/course.ts` imports its
> tables from `@/db/schema` — a **value** import, and vitest cannot resolve the
> `@/` alias (only `#/` is mapped). Any test that imports `../course` fails to
> load the module, and `vi.mock('@/db/schema')` cannot intercept a specifier
> vitest cannot resolve either. Extracting a pure core is not worth it here:
> this task is a single query with no branching logic. Verification is the
> full existing suite plus the manual check in Step 4. Task 6 *does* extract a
> pure function, because its logic is genuinely worth testing.

- [ ] **Step 1: Add the lean query**

Add to `src/db/course.ts`, next to `getMyCourses`:

```ts
/**
 * Just the slugs this user is subscribed to, for the course route's
 * enrollment guard.
 *
 * Separate from getMyCourses deliberately: the guard runs on the critical
 * path of every course navigation and needs one column, while getMyCourses
 * joins modules, lessons and video progress to compute a percentage the guard
 * then discards.
 */
export async function getSubscribedCourseSlugs(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ slug: coursesTable.slug })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .where(eq(courseSubscriptionsTable.userId, userId))
    .orderBy(asc(coursesTable.name));
  return rows.map((r) => r.slug);
}
```

- [ ] **Step 2: Point the server function at it**

In `src/lib/course-functions.ts`, change the `getMySubscribedSlugs` handler body (lines 15–21) to:

```ts
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session) return [];
    return getSubscribedCourseSlugs(session.user.id);
  },
```

Update the import from `#/db/course` to bring in `getSubscribedCourseSlugs`. Leave `getMyCourses` imported only if another function in the file still uses it — check, and drop it from the import list if not.

- [ ] **Step 3: Verify nothing else regressed**

Run: `pnpm vitest run && pnpm check && pnpm build`

Expected: all suites PASS, Biome clean, build succeeds.

- [ ] **Step 4: Verify the guard still guards**

`pnpm dev`, then:
1. Open a course you *are* subscribed to. Expected: it opens normally.
2. Edit the URL to a course slug you are **not** subscribed to. Expected: redirected to `/app`.
3. Edit the URL to a slug that does not exist. Expected: also redirected to `/app` (the two cases must stay indistinguishable — that is what stops catalogue enumeration).

- [ ] **Step 5: Commit**

```bash
git add src/db/course.ts src/lib/course-functions.ts
git commit -m "perf(nav): answer the enrollment guard with a one-column query

getMySubscribedSlugs ran the full getMyCourses aggregate — modules, lessons
and video progress — then kept only the slugs."
```

---

### Task 6: Link course cards straight to the resume lesson

Deletes the index-redirect hop for the common case. The card targets the lesson URL directly when a resume target exists, falling back to `/course/$courseSlug` (today's behaviour, which reaches the empty state) when it does not.

Safe because gating is enforced on the server — the lesson page independently asks and renders `LessonLocked` if the answer is no, so a direct link cannot bypass a gate. The accepted trade-off is staleness: progress made in a second tab can leave a card pointing at a lesson that has since locked, where the redirect would have re-resolved. `LessonLocked` already names what unlocks it and links there, so that failure mode is legible rather than a dead end.

**Files:**
- Create: `src/lib/course-card-resume.ts` (pure — the testable core)
- Create: `src/lib/__tests__/course-card-resume.test.ts`
- Create: `src/db/course-last-viewed-batch.ts`
- Modify: `src/db/course.ts` (`MyCourseSummary`, `getMyCourses`)
- Modify: `src/data-hooks/use-my-courses.ts`
- Modify: `src/components/courses/course-card.tsx`
- Modify: `src/components/courses/__tests__/course-card.test.tsx`
- Modify (if its fixtures fail): `src/routes/api/course/__tests__/my-courses.test.ts`

`src/routes/api/course/my-courses.ts` needs **no** change — it returns whatever `getMyCourses` gives it, so `resume` rides along.

**Interfaces:**
- Consumes: `resolveResumeTarget`, `ResumeTarget` from `#/lib/course-resume`; `toGateCourse`, `watchedLessonSlugs`, `DetailsCourse` from `#/lib/lesson-gating-inputs`; `watchedMilestones` from `#/lib/course-milestones`; `getCourseDetailsWithCache` from `#/db/course`; `getUserRoleNames` from `#/db/admin`; `ADMIN_ROLE` from `#/lib/admin-schemas`.
- Produces:
  - `resolveCardResume(args: { details: DetailsCourse & { modules: readonly { lessons: readonly { id: number; slug: string }[] }[] }; lessonHits: readonly { lessonId: number; watchedHits: number }[]; pointerLessonId: number | null; bypassLocks: boolean }): ResumeTarget` from `#/lib/course-card-resume`
  - `getLastViewedLessonIdsByCourse(userId: string): Promise<Map<number, number>>` from `#/db/course-last-viewed-batch` (course id → lesson id)
  - `MyCourseSummary` gains `resume: ResumeTarget`
  - `myCourseSchema` in `use-my-courses.ts` gains a matching `resume` field

> **Why a separate pure module.** `src/db/course.ts` cannot be unit-tested —
> it value-imports `@/db/schema`, and vitest resolves only `#/`. The logic
> worth testing here (the watched threshold and the pointer id→slug lookup) is
> pure, so it goes in `src/lib/` alongside `resolveResumeTarget` and
> `watchedLessonSlugs`, which exist in `src/lib/` for exactly this reason.
> `getMyCourses` is then a thin caller.

- [ ] **Step 1: Write the failing card test**

Extend `src/components/courses/__tests__/course-card.test.tsx`. First register the lesson route in the harness — inside `renderInRouter`, after `courseRoute`, add:

```tsx
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
```

and change the `addChildren` call to `rootRoute.addChildren([indexRoute, courseRoute, lessonRoute])`.

Then add `resume` to the shared `course` fixture:

```tsx
const course = {
  id: 1,
  name: '3D Airmanship',
  slug: '3d-airmanship',
  imageUrlAvif: null,
  imageUrlWebp: null,
  percent: 42,
  resume: { kind: 'none', reason: 'no-lessons' } as const,
};
```

and add these tests inside the existing `describe('CourseCard', ...)`:

```tsx
  it('links straight to the resume lesson when there is one', async () => {
    await renderInRouter(
      <CourseCard
        course={{
          ...course,
          resume: {
            kind: 'lesson',
            moduleSlug: 'navigation',
            lessonSlug: 'pilotage',
          },
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /3D Airmanship/ });
    expect(link.getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/navigation/lessons/pilotage',
    );
  });

  it('falls back to the course route when there is nothing to resume', async () => {
    await renderInRouter(<CourseCard course={course} />);
    const link = screen.getByRole('link', { name: /3D Airmanship/ });
    expect(link.getAttribute('href')).toBe('/course/3d-airmanship');
  });
```

The first existing test (`links to the course route by slug`) now duplicates the second new one — delete the old one rather than keeping both.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/courses/__tests__/course-card.test.tsx`

Expected: FAIL — the resume-lesson test gets `/course/3d-airmanship`, and TypeScript rejects the unknown `resume` property on `MyCourse`.

- [ ] **Step 3: Batch-read the last-viewed pointers**

Create `src/db/course-last-viewed-batch.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { courseLastViewedTable } from '#/db/schema';

/**
 * Every course this user has a last-viewed pointer for, as course id → lesson
 * id.
 *
 * One query for all of them. The per-course getLastViewedLessonId still exists
 * for the single-course route; this exists so building the /app grid does not
 * become N round trips.
 */
export async function getLastViewedLessonIdsByCourse(
  userId: string,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      courseId: courseLastViewedTable.courseId,
      lessonId: courseLastViewedTable.lessonId,
    })
    .from(courseLastViewedTable)
    .where(eq(courseLastViewedTable.userId, userId));

  const out = new Map<number, number>();
  for (const row of rows) {
    // lessonId is nullable via `on delete set null` — a pointer to a deleted
    // lesson is the same as no pointer at all.
    if (row.lessonId != null) out.set(row.courseId, row.lessonId);
  }
  return out;
}
```

- [ ] **Step 4: Write the failing test for the pure resume resolver**

The watched threshold is a gating hazard: too low and lessons unlock early. Test it directly.

Create `src/lib/__tests__/course-card-resume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveCardResume } from '../course-card-resume';

const lesson = (id: number, slug: string, dependsOn: { lessonSlug: string }[] = []) => ({
  id,
  slug,
  name: slug,
  isAvailable: true,
  videoId: `video-${id}`,
  needsVideoWatch: true,
  dependsOn,
});

// Two lessons where the second is gated on finishing the first.
const details = {
  modules: [
    {
      id: 1,
      slug: 'navigation',
      name: 'Navigation',
      dependsOn: [],
      lessons: [lesson(1, 'pilotage'), lesson(2, 'dead-reckoning', [{ lessonSlug: 'pilotage' }])],
    },
  ],
};

// watchedMilestones is 10..95, so a fully watched video hits every one of them.
const FULLY_WATCHED = 19;

describe('resolveCardResume', () => {
  it('does NOT treat a partially watched lesson as complete', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [{ lessonId: 1, watchedHits: 1 }],
      pointerLessonId: 2,
      bypassLocks: false,
    });
    // Lesson 1 is unfinished, so lesson 2 is still locked and the pointer must
    // hop back to the blocker rather than land on a lock screen.
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('treats a lesson as complete only when every milestone is hit', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [{ lessonId: 1, watchedHits: FULLY_WATCHED }],
      pointerLessonId: 2,
      bypassLocks: false,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'dead-reckoning',
    });
  });

  it('resolves the pointer id to its slug', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 1,
      bypassLocks: false,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('treats a pointer to a lesson no longer in the course as no pointer', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 9999,
      bypassLocks: false,
    });
    // Falls back to the first open lesson rather than throwing.
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'pilotage',
    });
  });

  it('ignores locks for an admin', () => {
    const result = resolveCardResume({
      details,
      lessonHits: [],
      pointerLessonId: 2,
      bypassLocks: true,
    });
    expect(result).toEqual({
      kind: 'lesson',
      moduleSlug: 'navigation',
      lessonSlug: 'dead-reckoning',
    });
  });
});
```

Before running, confirm `FULLY_WATCHED` matches reality: `watchedMilestones` is `milestones.filter(m => m !== 100)` in `src/lib/course-milestones.ts`. Read that file and set the constant to `watchedMilestones.length` — or import it directly and use `watchedMilestones.length`, which is better because it cannot drift.

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/course-card-resume.test.ts`

Expected: FAIL — `Cannot find module '../course-card-resume'`.

- [ ] **Step 6: Write the pure resolver**

Create `src/lib/course-card-resume.ts`:

```ts
import { watchedMilestones } from '#/lib/course-milestones';
import { type ResumeTarget, resolveResumeTarget } from '#/lib/course-resume';
import {
  type DetailsCourse,
  toGateCourse,
  watchedLessonSlugs,
} from '#/lib/lesson-gating-inputs';

type CardResumeArgs = {
  details: DetailsCourse;
  /** Per-lesson distinct watched-milestone counts, straight from the grid query. */
  lessonHits: readonly { lessonId: number; watchedHits: number }[];
  pointerLessonId: number | null;
  bypassLocks: boolean;
};

/**
 * Where a course card should link, resolved without a database.
 *
 * Pure and in `src/lib/` on purpose: `src/db/course.ts` value-imports
 * `@/db/schema`, which vitest cannot resolve, so logic that needs tests cannot
 * live there. Mirrors `resolveResumeTarget`/`watchedLessonSlugs`, which are in
 * `src/lib/` for the same reason.
 */
export function resolveCardResume({
  details,
  lessonHits,
  pointerLessonId,
  bypassLocks,
}: CardResumeArgs): ResumeTarget {
  // A lesson counts as watched only when EVERY watched-milestone was hit — the
  // same rule as hasWatchedVideo and isVideoWatched. A `> 0` test here would
  // mark a lesson complete after seconds of playback and unlock everything
  // downstream of it.
  const watched = watchedLessonSlugs(details, {
    lessons: lessonHits.map((hit) => ({
      lessonId: hit.lessonId,
      watched: hit.watchedHits === watchedMilestones.length,
    })),
  });

  // The pointer is stored as an FK; the predicate works in slugs. An id absent
  // from the payload — deleted, made WIP, or a cache race — resolves to null,
  // which resolveResumeTarget treats exactly like a first visit.
  const pointerLessonSlug =
    pointerLessonId == null
      ? null
      : (details.modules
          .flatMap((m) => m.lessons)
          .find((l) => l.id === pointerLessonId)?.slug ?? null);

  return resolveResumeTarget({
    course: toGateCourse(details),
    watched,
    pointerLessonSlug,
    bypassLocks,
  });
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/course-card-resume.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 8: Add `resume` to the course summary**

In `src/db/course.ts`, extend the type:

```ts
export type MyCourseSummary = {
  id: number;
  name: string;
  slug: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
  percent: number;
  /** Where a click on this course's card should land. See getMyCourses. */
  resume: ResumeTarget;
};
```

Add the imports `import type { ResumeTarget } from '#/lib/course-resume';`, `import { resolveCardResume } from '#/lib/course-card-resume';`, `import { getUserRoleNames } from '#/db/admin';`, `import { ADMIN_ROLE } from '#/lib/admin-schemas';`, and `import { getLastViewedLessonIdsByCourse } from '#/db/course-last-viewed-batch';`. (`watchedMilestones` is already imported at line 2 and is now used only inside `resolveCardResume` — leave the existing import alone, `getMyCourses`'s own query still uses it.)

Then, in `getMyCourses`, replace the final `return [...courses.values()];` with:

```ts
  // Resolve each card's destination here so a click can go straight to the
  // lesson instead of bouncing through /course/$slug's redirect. Cost is one
  // extra batched query plus the already-cached course payloads — not a round
  // trip per course. All the real logic is in resolveCardResume, which is pure
  // and tested; this is just plumbing.
  const [pointers, roles] = await Promise.all([
    getLastViewedLessonIdsByCourse(userId),
    getUserRoleNames(userId),
  ]);
  const bypassLocks = roles.includes(ADMIN_ROLE);

  return Promise.all(
    [...courses.values()].map(async (course): Promise<MyCourseSummary> => {
      const details = await getCourseDetailsWithCache(course.slug);
      // A missing payload means Redis is down or a cache race lost. Falling
      // back to 'no-lessons' keeps the card clickable via the /course/$slug
      // route, which re-resolves properly — better than failing the whole grid.
      if (!details) {
        return { ...course, resume: { kind: 'none', reason: 'no-lessons' } };
      }

      return {
        ...course,
        resume: resolveCardResume({
          details,
          lessonHits: rows
            .filter((r) => r.courseId === course.id && r.lessonId != null)
            .map((r) => ({
              lessonId: r.lessonId as number,
              watchedHits: Number(r.watchedHits),
            })),
          pointerLessonId: pointers.get(course.id) ?? null,
          bypassLocks,
        }),
      };
    }),
  );
```

- [ ] **Step 9: Widen the client schema**

In `src/data-hooks/use-my-courses.ts`, add the resume shape above `myCourseSchema` and a field to it:

```ts
const resumeSchema = z.union([
  z.object({
    kind: z.literal('lesson'),
    moduleSlug: z.string(),
    lessonSlug: z.string(),
  }),
  z.object({ kind: z.literal('none') }).passthrough(),
]);
```

and inside `myCourseSchema`:

```ts
  resume: resumeSchema,
```

The `none` branch uses `passthrough()` because the card only ever branches on `kind` — the `reason` and `lock` fields exist for the empty state, and re-declaring them here would mean two schemas to keep in step.

- [ ] **Step 10: Point the card at the resume target**

In `src/components/courses/course-card.tsx`, replace the opening `<Link>` (lines 15–19) with:

```tsx
  const resume = course.resume;

  const linkProps =
    resume.kind === 'lesson'
      ? ({
          to: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
          params: {
            courseSlug: course.slug,
            moduleSlug: resume.moduleSlug,
            lessonSlug: resume.lessonSlug,
          },
        } as const)
      : // Nothing to resume: fall back to the course route, whose beforeLoad
        // re-resolves and lands on the empty state.
        ({
          to: '/course/$courseSlug',
          params: { courseSlug: course.slug },
        } as const);

  return (
    <Link
      {...linkProps}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-2 transition-colors hover:border-gray-8"
    >
```

The rest of the component body is unchanged.

- [ ] **Step 11: Run the card test to verify it passes**

Run: `pnpm vitest run src/components/courses/__tests__/course-card.test.tsx`

Expected: PASS.

- [ ] **Step 12: Fix the API route test fixture**

Run: `pnpm vitest run src/routes/api/course/__tests__/my-courses.test.ts`

If it fails on the new `resume` field, update its fixtures to include `resume: { kind: 'none', reason: 'no-lessons' }` — do not loosen the assertions.

- [ ] **Step 13: Run everything and verify in the app**

Run: `pnpm vitest run && pnpm check && pnpm build`

Expected: all PASS, Biome clean, build succeeds.

Then `pnpm dev`, open `/app`:
1. Hover a card and read its status-bar URL. Expected: a full `/course/…/modules/…/lessons/…` URL for a course with progress.
2. Click it. Expected: lands directly on the lesson with **no** intermediate redirect in the Network panel.
3. Check a course you have never opened. Expected: the URL is the resume target's first open lesson, and it opens correctly.

- [ ] **Step 14: Commit**

```bash
git add src/lib/course-card-resume.ts src/lib/__tests__/course-card-resume.test.ts src/db/course.ts src/db/course-last-viewed-batch.ts src/data-hooks/use-my-courses.ts src/components/courses/course-card.tsx src/components/courses/__tests__/course-card.test.tsx src/routes/api/course/__tests__/my-courses.test.ts
git commit -m "perf(nav): link course cards straight to the resume lesson

Deletes the /course/\$slug redirect hop for the common path. Gating is still
enforced server-side on the lesson page, so a direct link cannot bypass a lock."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| A1 `AppShellSkeleton` | 1 |
| A2 per-route pending state | 1 |
| A3 card press feedback | 2 |
| A4 skeleton→content crossfade | 2 |
| B1 guards through React Query | 4 |
| B2 lean enrollment check | 5 |
| B3 direct resume links | 6 |
| Accepted staleness trade-off | 6 (preamble) |
| Rejected `defaultPreloadStaleTime` change | Global Constraints |

**Deviations from the spec, all discovered while writing this plan:**

1. **A3 needs no `useIsNavigatingTo` hook.** `Link` already sets `data-transitioning` on itself and clears it on `onResolved`. The spec's intent — self-correcting, not an `onClick` flag — is preserved exactly; the mechanism is now a built-in, and Task 2 is pure CSS.
2. **Task 3 is new.** `getContext()` is called twice, producing two independent `QueryClient` instances, so SSR-hydrated data never reaches the app's `useQuery` hooks. Pre-existing, and Task 4 needs it fixed to deliver its benefit.
3. **Task 6 extracts a pure `resolveCardResume`.** `src/db/course.ts` value-imports `@/db/schema`, which vitest cannot resolve, so nothing in that file is unit-testable. The logic worth testing is pure, so it moves to `src/lib/` — the same reason `resolveResumeTarget` and `watchedLessonSlugs` already live there.
4. **Task 5 ships without a unit test,** for the same `@/`-resolution reason, and has no pure core worth extracting (one query, no branching). It gets an explicit manual guard check instead.

**Correctness note carried into Task 6:** "watched" means **every** watched-milestone was hit (`watchedMilestones.length`), matching `hasWatchedVideo` and `isVideoWatched` — not `watchedHits > 0`. A looser test would mark a lesson complete after seconds of playback and unlock everything gated behind it. This is the single most dangerous line in the plan, which is why Task 6 Step 4 tests it from both sides.

**Type consistency:** `ResumeTarget` is used identically in Tasks 4 and 6. `MyCourseSummary.resume` (server) and `myCourseSchema.resume` (client) describe the same shape. `resolveCardResume` is named the same at its definition (Task 6 Step 6), its call site (Step 8), and its test (Step 4). `getSubscribedCourseSlugs` (Task 5) matches at definition and call site.

**Manual-verification steps are load-bearing.** Route files and `src/db/course.ts` cannot be unit-tested here, so Tasks 1, 3, 4, 5 and 6 each end with a specific in-app check. Those are the only verification of the router wiring, the single-client fix, the preload payoff, and the enrollment guard. Do not skip them.
