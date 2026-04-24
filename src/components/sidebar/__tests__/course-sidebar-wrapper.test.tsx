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
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/data/use-course-details', () => ({
  useCourseDetails: vi.fn(),
}));

import { useCourseDetails } from '../../../hooks/data/use-course-details';
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

async function renderAt(path: string) {
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
  const result = render(
    <Provider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Provider>,
  );
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

describe('CourseSidebarWrapper', () => {
  it('renders the skeleton while loading', async () => {
    mockedHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    const { container } = await renderAt('/');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when the query errors', async () => {
    mockedHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useCourseDetails>);
    await renderAt('/');
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders the error when data resolves to null', async () => {
    mockedHook.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    await renderAt('/');
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders header + modules when ready and marks the active lesson from the URL', async () => {
    mockedHook.mockReturnValue({
      data: fakeCourse,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCourseDetails>);
    await renderAt('/modules/intermediate/lessons/yaw');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('2 modules · 3 lessons')).toBeDefined();
    // The wrapper should auto-open the module containing the active lesson
    await waitFor(() => {
      const yawLink = screen.getByRole('link', { name: 'Yaw' });
      expect(yawLink.getAttribute('aria-current')).toBe('page');
    });
  });
});
