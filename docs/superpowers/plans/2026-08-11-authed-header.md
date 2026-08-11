# Authenticated Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every post-login screen shows the same header anatomy — a logo linking to `/app` at the inline-start edge and a sign-out control at the inline-end edge.

**Architecture:** A new presentational `LogoLink` becomes the single source of truth for the mark-as-home-link. `AppHeader` adopts it and is mounted on the admin layout (which has neither logo nor sign-out today). Course routes, which own the full viewport via `AppShell`, get the same anatomy by filling `AppShell`'s already-existing but unused `headerAside` slot — not by stacking a second header.

**Tech Stack:** React 19, TanStack Router (file-based routes), TanStack Query, Tailwind v4, Base UI, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-08-11-authed-header-design.md`

## Global Constraints

- **Logical CSS properties only.** `ps-*`/`pe-*`, never `pl-*`/`pr-*`. Same for `ms/me`, `start/end`, `border-s/e`, `text-start/end`.
- **Presentational components are pure props-to-JSX.** Hooks, data fetching, and mutations live in `*-container.tsx`.
- **Filenames kebab-case, exports PascalCase.**
- **No jest-dom matchers in this repo.** Use `toBeTruthy()`, `toBeDefined()`, `toBeNull()` — not `toBeInTheDocument()`.
- **Vitest resolves `#/`, not `@/`.** Inside `src/components/` prefer relative imports (`./logo`, `../lib/cn`), matching the files already there.
- **`src/styles/theme.generated.ts` is gitignored and built from env.** Any test that transitively imports it must stub it, exactly as `app-header.test.tsx` already stubs `../logo`.
- **Assert on what the consumer received** — that a collaborator was called with the value, not that the value exists in state.
- **Every test must be seen failing before its implementation is written.**

---

### Task 1: `LogoLink` presentational component

**Files:**
- Create: `src/components/logo-link.tsx`
- Test: `src/components/__tests__/logo-link.test.tsx`

**Interfaces:**
- Consumes: `Logo` from `./logo`, `cn` from `../lib/cn`, `appTitle` from `../styles/theme.generated`.
- Produces: `LogoLink({ className?: string })` — used by Task 2 and Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/logo-link.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoLink } from '../logo-link';

/**
 * `theme.generated` is gitignored and produced at build time, so a test that
 * imports it for real passes or fails on whether the theme happens to have
 * been generated. Same reasoning as the `../logo` stub in app-header.test.tsx.
 */
vi.mock('../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

/** A stand-in route tree: `/app` must exist for `to="/app"` to resolve. */
async function renderLogoLink() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const elsewhereRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => <LogoLink />,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, elsewhereRoute]),
    history: createMemoryHistory({ initialEntries: ['/admin'] }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one
  render(<RouterProvider router={router as any} />);
  await waitFor(() => expect(screen.getByRole('link')).toBeDefined());
}

describe('LogoLink', () => {
  it('points home to /app', async () => {
    await renderLogoLink();

    expect(screen.getByRole('link').getAttribute('href')).toBe('/app');
  });

  /**
   * `Logo` carries its own `role="img"` + `aria-label`. Nested inside a link
   * that also has a label, a screen reader announces the name twice. Asserting
   * no `img` role survives is what proves the wrapper actually hid it — a
   * version that drops `aria-hidden` still renders and still links, and only
   * this assertion goes red.
   */
  it('exposes exactly one accessible name, the link’s', async () => {
    await renderLogoLink();

    expect(
      screen.getByRole('link', { name: 'Test Academy, home' }),
    ).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/components/__tests__/logo-link.test.tsx
```

Expected: FAIL — `Failed to resolve import "../logo-link"`.

- [ ] **Step 3: Write the component**

Create `src/components/logo-link.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import { cn } from '../lib/cn';
import { appTitle } from '../styles/theme.generated';
import { Logo } from './logo';

/**
 * Sizing lives here rather than at each call site so `/app`, the admin
 * screens, and the course shell cannot drift apart.
 */
const LOGO_CLASSNAME =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center';

/**
 * The logo as a link home, shared by `AppHeader` and the course shell's
 * `headerAside` slot so the mark sits at the inline-start edge and behaves
 * identically on every authenticated screen.
 *
 * `Logo` already carries `role="img"` and `aria-label={appTitle}`. Nesting
 * that inside a link would announce the name twice, so the wrapper hides it
 * from the accessibility tree and the link owns the accessible name.
 */
export const LogoLink = ({ className }: { className?: string }) => (
  <Link
    to="/app"
    aria-label={`${appTitle}, home`}
    className={cn(
      'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
      className,
    )}
  >
    <span aria-hidden="true">
      <Logo className={LOGO_CLASSNAME} />
    </span>
  </Link>
);
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/components/__tests__/logo-link.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/logo-link.tsx src/components/__tests__/logo-link.test.tsx
git commit -m "feat(ui): add LogoLink, the logo as a link home"
```

---

### Task 2: `AppHeader` adopts `LogoLink`

**Files:**
- Modify: `src/components/app-header.tsx:1-31`
- Modify: `src/components/__tests__/app-header.test.tsx:1-31`

**Interfaces:**
- Consumes: `LogoLink` from Task 1.
- Produces: no API change — `AppHeader({ onSignOut, isSigningOut })` is unchanged for Task 3.

Because `AppHeader` now renders a router `Link`, its test can no longer render it bare — it needs a `RouterProvider`. The existing `vi.mock('../logo')` still intercepts (LogoLink imports the same module), but `LogoLink` also reads `appTitle`, so `theme.generated` needs stubbing too.

- [ ] **Step 1: Update the test to expect a home link**

In `src/components/__tests__/app-header.test.tsx`, replace lines 1–31 (imports, the `../logo` mock, and `renderHeader`) with:

```tsx
// @vitest-environment jsdom
import { Tooltip } from '@base-ui/react/tooltip';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../app-header';

/**
 * The real Logo reads `src/styles/theme.generated`, which is gitignored and
 * produced at build time. Stubbing both keeps this test about the header's
 * wiring rather than about whether the theme happens to have been generated.
 */
vi.mock('../logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <span data-testid="logo" className={className} />
  ),
}));

vi.mock('../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

/**
 * The header now contains a router `Link`, so it cannot render bare. `/app`
 * must exist in the stand-in tree for `to="/app"` to resolve.
 */
const renderHeader = async (props: {
  onSignOut: () => void;
  isSigningOut: boolean;
}) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => (
      <Tooltip.Provider delay={0}>
        <AppHeader {...props} />
      </Tooltip.Provider>
    ),
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/app'] }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one
  render(<RouterProvider router={router as any} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Sign(ing)? out/ })).toBeDefined(),
  );
};
```

Then make every existing call `await renderHeader(...)` and its `it` callback `async`, and replace the first test (lines 29–32 of the original, `renders the logo slot`) with:

```tsx
  it('renders the logo as a link home', async () => {
    await renderHeader({ onSignOut: vi.fn(), isSigningOut: false });

    expect(screen.getByRole('link').getAttribute('href')).toBe('/app');
  });
```

The other three tests (`calls onSignOut…`, `announces the pending state…`, `cannot be fired again…`) keep their bodies verbatim — only `async` + `await` are added.

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/components/__tests__/app-header.test.tsx
```

Expected: FAIL — `Unable to find an accessible element with the role "link"`, because `AppHeader` still renders a bare `Logo`.

- [ ] **Step 3: Swap `Logo` for `LogoLink`**

In `src/components/app-header.tsx`, replace the `Logo` import with `LogoLink`:

```tsx
import { LogoLink } from './logo-link';
import { SignOutButton } from './sign-out-button';
```

and replace the logo slot (lines 24–26) with:

```tsx
      {/* Logo slot. The mark itself comes from the generated theme, so
          rebranding is an env change rather than a code change. It links to
          /app — a self-link on this page, and the way back from admin. */}
      <LogoLink />
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/components/__tests__/app-header.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-header.tsx src/components/__tests__/app-header.test.tsx
git commit -m "feat(ui): make the app header logo a link home"
```

---

### Task 3: Mount the header on admin screens

**Files:**
- Create: `src/components/admin/admin-shell-layout.tsx`
- Create: `src/components/admin/__tests__/admin-shell-layout.test.tsx`
- Modify: `src/routes/_authed/admin.tsx:18-40`

**Interfaces:**
- Consumes: `AppHeaderContainer` from `../app-header-container`.
- Produces: `AdminShellLayout({ canSeePeople: boolean, children: ReactNode })`.

`AdminShell` currently calls `Route.useRouteContext()` inline, which cannot be rendered outside the real generated route tree — so the reachability requirement is untestable as written. Extracting the markup into a presentational component with `canSeePeople` as a prop makes it testable and matches the repo's container/presentational split. The route keeps the permission read.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/__tests__/admin-shell-layout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShellLayout } from '../admin-shell-layout';

vi.mock('../../logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <span data-testid="logo" className={className} />
  ),
}));

vi.mock('../../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

const renderAdmin = async (canSeePeople: boolean) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/users',
    component: () => null,
  });
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => (
      <AdminShellLayout canSeePeople={canSeePeople}>
        <p>Course list</p>
      </AdminShellLayout>
    ),
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, usersRoute, adminRoute]),
    history: createMemoryHistory({ initialEntries: ['/admin'] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('Course list')).toBeDefined());
};

describe('AdminShellLayout', () => {
  /**
   * The requirement is that sign-out is reachable from every screen inside the
   * app. Admin had no sign-out at all before this change, so this is the test
   * that goes red if the header ever stops being mounted here.
   */
  it('puts a sign-out control on admin screens', async () => {
    await renderAdmin(true);

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('offers a way back to /app', async () => {
    await renderAdmin(true);

    const home = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/app');
    expect(home).toBeDefined();
  });

  /**
   * The section nav is permission-gated, but the header is not: an admin
   * without `user:read` still needs to be able to leave.
   */
  it('keeps sign-out reachable when the section nav is hidden', async () => {
    await renderAdmin(false);

    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/components/admin/__tests__/admin-shell-layout.test.tsx
```

Expected: FAIL — `Failed to resolve import "../admin-shell-layout"`.

- [ ] **Step 3: Create the layout component**

Create `src/components/admin/admin-shell-layout.tsx`, moving the nav markup out of the route verbatim:

```tsx
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AppHeaderContainer } from '../app-header-container';

/**
 * Chrome shared by every `/admin/*` screen: the app header (logo home + sign
 * out) above the permission-gated section nav.
 *
 * Presentational apart from the header container it mounts — the permission
 * read stays in the route, which is the only place that can perform it.
 */
export const AdminShellLayout = ({
  canSeePeople,
  children,
}: {
  canSeePeople: boolean;
  children: ReactNode;
}) => (
  <>
    <AppHeaderContainer />
    {canSeePeople && (
      <nav
        aria-label="Admin sections"
        className="content-grid border-gray-6 border-b bg-gray-2"
      >
        <div className="content flex gap-1 py-2">
          <AdminNavLink to="/admin">Courses</AdminNavLink>
          <AdminNavLink to="/admin/users">People</AdminNavLink>
        </div>
      </nav>
    )}
    {children}
  </>
);

const AdminNavLink = ({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) => (
  <Link
    to={to}
    // `exact` on /admin only, so /admin/users doesn't light both links up.
    activeOptions={{ exact: to === '/admin' }}
    className="rounded-lg px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-[status=active]:bg-gray-4 data-[status=active]:text-primary"
  >
    {children}
  </Link>
);
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/components/admin/__tests__/admin-shell-layout.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Point the route at the layout**

Replace `src/routes/_authed/admin.tsx` lines 18–57 (the whole `AdminShell` function and the `AdminNavLink` const below it) with:

```tsx
function AdminShell() {
  const { permissions } = Route.useRouteContext();
  // Rendered only with `user:read` — a link to a page that redirects straight
  // back is worse than no link, and the route guards itself regardless.
  const canSeePeople = hasPermissionKey(permissions, 'user', 'read');

  return (
    <AdminShellLayout canSeePeople={canSeePeople}>
      <Outlet />
    </AdminShellLayout>
  );
}
```

Update the imports at the top: drop `Link` (now unused here), keep `createFileRoute`, `Outlet`, `redirect`, and add:

```tsx
import { AdminShellLayout } from '@/components/admin/admin-shell-layout';
```

- [ ] **Step 6: Verify the whole suite and the types**

```bash
pnpm test && pnpm check
```

Expected: all tests pass; biome reports no unused-import or lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/admin-shell-layout.tsx \
        src/components/admin/__tests__/admin-shell-layout.test.tsx \
        src/routes/_authed/admin.tsx
git commit -m "feat(admin): give admin screens the app header and sign-out"
```

---

### Task 4: Fill the course shell's `headerAside` with the logo

**Files:**
- Modify: `src/routes/_authed/course.$courseSlug.tsx:144-172`

**Interfaces:**
- Consumes: `LogoLink` from Task 1.
- Produces: nothing downstream — this is the last task.

`.app-shell__header-aside` sets only `grid-column`, `min-inline-size`, and `overflow` — it does not centre its content, so the slot content brings its own `flex h-full items-center`. `ps-4` mirrors the `pe-4` already on the `headerMain` row so the logo and the sign-out button sit at symmetric insets.

This task has no unit test: `course.$courseSlug.tsx` is a route module that no existing test mounts, and standing up a route harness to assert one prop would test the harness. `LogoLink` itself is covered by Task 1; this step is verified by type-check and on screen.

- [ ] **Step 1: Add the import**

In `src/routes/_authed/course.$courseSlug.tsx`, alongside the existing component imports:

```tsx
import { LogoLink } from "../../components/logo-link";
```

- [ ] **Step 2: Pass the slot**

Add `headerAside` as the first prop on `<AppShell` (line 145), immediately before the existing `headerMain` comment block:

```tsx
    <AppShell
      // The shell owns the viewport, so the logo goes in the header's aside
      // cell rather than in a second header above it. `ps-4` mirrors the
      // `pe-4` on headerMain so logo and sign-out sit at symmetric insets.
      headerAside={<LogoLink className="flex h-full items-center ps-4" />}
```

- [ ] **Step 3: Verify types and the full suite**

```bash
pnpm test && pnpm check
```

Expected: all tests pass, no lint or type errors.

- [ ] **Step 4: Verify on screen**

Start the dev server from a shell that has never sourced the env file, and sign in:

```bash
pnpm dev
```

Check at `http://localhost:5001`:
1. `/app` — logo at inline-start, sign-out at inline-end; clicking the logo stays on `/app`.
2. `/admin` and `/admin/users` — header present; logo returns to `/app`; sign-out works.
3. `/course/<slug>` and a lesson page — logo sits above the sidebar, aligned with the course nav and sign-out on the same row; the sidebar and lesson body are unshifted and nothing overflows `100dvh`.
4. Both light and dark themes.
5. **The stacked-bar check from the spec:** on `/admin`, `AppHeader` and the section nav both carry `border-b border-gray-6 bg-gray-2`. Confirm the two bars read as header + subnav rather than as one heavy slab. If it reads badly, drop `border-b` from the header on admin only — do not restyle the shared `AppHeader` for every screen.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/course.\$courseSlug.tsx
git commit -m "feat(course): put the logo in the course shell header"
```

---

## Verification checklist

- [ ] `pnpm test` — full suite green
- [ ] `pnpm check` — biome clean
- [ ] Logo links to `/app` from all three areas
- [ ] Sign-out reachable from `/app`, `/admin/*`, `/course/*`
- [ ] No duplicate sign-out control on any screen
- [ ] Course shell still fits `100dvh` with no scrollbar on the shell itself
