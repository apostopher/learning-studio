// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonList } from '../lesson-list';

async function renderInRouter(ui: React.ReactNode) {
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
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
}

const lessons = [
  { slug: 'a', name: 'Lesson A' },
  { slug: 'b', name: 'Lesson B' },
  { slug: 'c', name: 'Lesson C' },
];

describe('LessonList', () => {
  it('renders one LessonLink per lesson in a single <ul>', async () => {
    await renderInRouter(
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

  it('marks only the matching lesson as active', async () => {
    await renderInRouter(
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
