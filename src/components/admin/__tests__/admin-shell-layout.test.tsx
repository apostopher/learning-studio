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

    expect(
      screen.queryByRole('navigation', { name: 'Admin sections' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });
});
