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
import { CourseSidebar } from '../course-sidebar';

const modules = [
  {
    id: 1,
    name: 'Fundamentals',
    slug: 'fundamentals',
    lessons: [{ slug: 'pitch', name: 'Pitch', videoId: null }],
  },
];

type Props = Parameters<typeof CourseSidebar>[0];

async function renderStatus(props: Props) {
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
  const result = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

describe('CourseSidebar', () => {
  it('renders a nav landmark with the "Course contents" label', async () => {
    await renderStatus({
      status: 'loading',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(
      screen.getByRole('navigation', { name: 'Course contents' }),
    ).toBeDefined();
  });

  it('renders the skeleton when status is "loading"', async () => {
    const { container } = await renderStatus({
      status: 'loading',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when status is "error"', async () => {
    await renderStatus({
      status: 'error',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't load the course",
    );
  });

  it('renders header + accordion when status is "ready"', async () => {
    await renderStatus({
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
