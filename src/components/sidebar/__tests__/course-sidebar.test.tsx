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
import { describe, expect, it } from 'vitest';
import { CourseSidebar } from '../course-sidebar';

const modules = [
  {
    id: 1,
    name: 'Fundamentals',
    slug: 'fundamentals',
    lessons: [{ slug: 'pitch', name: 'Pitch', hasVideo: false }],
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
    path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute, appRoute]),
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
      courseSlug: '3d-airmanship',
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
      courseSlug: '3d-airmanship',
      status: 'loading',
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when status is "error"', async () => {
    await renderStatus({
      courseSlug: '3d-airmanship',
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
      courseSlug: '3d-airmanship',
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

  it('renders a "Courses" link back to /app', async () => {
    await renderStatus({
      courseSlug: '3d-airmanship',
      status: 'ready',
      title: '3D Airmanship',
      moduleCount: 1,
      lessonCount: 1,
      modules,
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
    });
    const backLink = screen.getByRole('link', { name: 'Courses' });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute('href')).toBe('/app');
  });

  it('threads the level prop through to the header badge', async () => {
    await renderStatus({
      courseSlug: '3d-airmanship',
      status: 'ready',
      title: '3D Airmanship',
      moduleCount: 1,
      lessonCount: 1,
      modules,
      openModuleSlug: null,
      onOpenChange: () => {},
      activeLessonSlug: null,
      level: 'Intermediate',
    });
    expect(screen.getByText('Intermediate')).toBeDefined();
  });
});
