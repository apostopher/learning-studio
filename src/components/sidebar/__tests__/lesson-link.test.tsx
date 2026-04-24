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
import { LessonLink } from '../lesson-link';

async function renderInRouter(ui: React.ReactNode, initialPath = '/') {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
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
  const routeTree = rootRoute.addChildren([indexRoute, lessonRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  // Wait for router to complete initial routing
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
}

const lesson = { slug: 'pitch-and-roll', name: 'Pitch and roll' };

describe('LessonLink', () => {
  it('renders a link to the lesson route', async () => {
    await renderInRouter(
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

  it('marks the link as current and applies the active class when isActive is true', async () => {
    await renderInRouter(
      <LessonLink moduleSlug="fundamentals" lesson={lesson} isActive />,
    );
    const link = screen.getByRole('link', { name: 'Pitch and roll' });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('sidebar-row-active');
  });

  it('always applies the focus-ring class', async () => {
    await renderInRouter(
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
