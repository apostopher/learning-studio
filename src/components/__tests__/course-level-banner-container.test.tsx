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
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useMyLevelMock = vi.fn();
vi.mock('#/data-hooks/use-my-level', () => ({
  useMyLevel: (courseSlug: string) => useMyLevelMock(courseSlug),
  useAcknowledgeLevelChange: () => ({ mutate: vi.fn() }),
}));

import { CourseLevelBannerContainer } from '../course-level-banner-container';

async function renderAt(path: string, roles: string[] = []) {
  const queryClient = new QueryClient();
  const rootRoute = createRootRoute({
    beforeLoad: () => ({ roles }),
    component: () => (
      <QueryClientProvider client={queryClient}>
        <CourseLevelBannerContainer />
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug',
    component: () => null,
  });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([courseRoute, appRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const result = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CourseLevelBannerContainer', () => {
  it('shows the banner for a non-admin pilot with a pending change', async () => {
    useMyLevelMock.mockReturnValue({
      data: {
        level: 'intermediate',
        pendingChange: {
          id: 1,
          level: 'intermediate',
          message: null,
          source: 'earned',
        },
      },
    });
    await renderAt('/course/c-1');
    expect(screen.getByRole('status').textContent).toContain(
      'You’ve reached Intermediate',
    );
  });

  /**
   * The consistency fix: the level badge already hides for admins
   * ("an admin's own row carries no meaning" — course-sidebar-wrapper.tsx).
   * The banner must not contradict that by announcing a change to a level
   * the sidebar itself refuses to show.
   */
  it('hides the banner for an admin, even with a pending change', async () => {
    useMyLevelMock.mockReturnValue({
      data: {
        level: 'intermediate',
        pendingChange: {
          id: 1,
          level: 'intermediate',
          message: null,
          source: 'earned',
        },
      },
    });
    await renderAt('/course/c-1', ['admin']);
    expect(screen.queryByRole('status')).toBeNull();
    // Never even asked for the admin's own level.
    expect(useMyLevelMock).not.toHaveBeenCalled();
  });

  it('renders the bare bar off a course route', async () => {
    const { container } = await renderAt('/app');
    const bar = container.querySelector('.alert-bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });
});
