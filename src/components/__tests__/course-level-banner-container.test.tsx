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

// "Am I reading this course as its author" is answered by the SERVER, in the
// course-details payload — not by the viewer's roles. A `subject-expert`
// authors one course and is an ordinary gated learner in every other, so a
// roles check would silence this banner on courses where their level really
// did change.
const useCourseDetailsMock = vi.fn();
vi.mock('#/hooks/data/use-course-details', () => ({
  useCourseDetails: (slug?: string) => useCourseDetailsMock(slug),
}));

import { CourseLevelBannerContainer } from '../course-level-banner-container';

async function renderAt(path: string) {
  const queryClient = new QueryClient();
  const rootRoute = createRootRoute({
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
  // A settled payload for someone who does NOT author this course, so every
  // test that does not care about authorship still takes the learner path.
  useCourseDetailsMock.mockReturnValue({ data: { viewingAsAuthor: false } });
});

describe('CourseLevelBannerContainer', () => {
  it('shows the banner for a pilot with a pending change', async () => {
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
   * The consistency fix: the level badge already hides for someone reading
   * the course as its author ("an author's own row carries no meaning" —
   * course-sidebar-wrapper.tsx). The banner must not contradict that by
   * announcing a change to a level the sidebar itself refuses to show.
   */
  it('hides the banner for an author of this course, even with a pending change', async () => {
    useCourseDetailsMock.mockReturnValue({ data: { viewingAsAuthor: true } });
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
    expect(screen.queryByRole('status')).toBeNull();
    // Never even asked for the author's own level.
    expect(useMyLevelMock).not.toHaveBeenCalled();
  });

  it('asks about the course in the URL, not about courses in general', async () => {
    // A course-scoped grant only silences the banner on the course it covers,
    // which is only true if the question names that course.
    await renderAt('/course/c-1');
    expect(useCourseDetailsMock).toHaveBeenCalledWith('c-1');
  });

  it('holds the bar until the payload says who is reading', async () => {
    // Announcing a level change to someone who turns out to author the course
    // is the wrong way to be wrong, so an unresolved payload shows nothing.
    useCourseDetailsMock.mockReturnValue({ data: undefined });
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
    const { container } = await renderAt('/course/c-1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      container.querySelector('.alert-bar')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('renders the bare bar off a course route', async () => {
    const { container } = await renderAt('/app');
    const bar = container.querySelector('.alert-bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });
});
