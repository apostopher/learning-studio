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
import { describe, expect, it, vi } from 'vitest';
import { LessonPlaceholder } from '../modules.$moduleSlug.lessons.$lessonSlug';

vi.mock('../../hooks/data/use-course-details', () => ({
  useCourseDetails: () =>
    ({ data: null, isLoading: false, isError: false }) as unknown,
}));

async function renderAt(path: string) {
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
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
}

describe('LessonPlaceholder', () => {
  it('renders the moduleSlug and lessonSlug from the URL', async () => {
    await renderAt('/modules/fundamentals/lessons/pitch');
    expect(screen.getByText('Module:')).toBeDefined();
    expect(screen.getByText('fundamentals')).toBeDefined();
    expect(screen.getByText('Lesson:')).toBeDefined();
    expect(screen.getByText('pitch')).toBeDefined();
  });
});
