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
import { CourseSidebarHeader } from '../course-sidebar-header';

type Props = Parameters<typeof CourseSidebarHeader>[0];

// CourseSidebarHeader renders a <Link to="/app">, which needs a router
// context to resolve — mirrors the in-memory router setup in
// course-sidebar.test.tsx.
async function renderHeader(props: Props) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CourseSidebarHeader {...props} />,
  });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, appRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const result = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

describe('CourseSidebarHeader', () => {
  it('renders the title, subtitle counts, and the course progress ring', async () => {
    await renderHeader({
      title: '3D Airmanship',
      moduleCount: 12,
      lessonCount: 87,
      coursePercent: 42,
    });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('12 modules · 87 lessons')).toBeDefined();
    const ring = screen.getByRole('progressbar', {
      name: 'Course 3D Airmanship progress',
    });
    expect(ring.getAttribute('aria-valuenow')).toBe('42');
  });

  it('singularises the counts correctly', async () => {
    await renderHeader({
      title: 'Tiny',
      moduleCount: 1,
      lessonCount: 1,
      coursePercent: 0,
    });
    expect(screen.getByText('1 module · 1 lesson')).toBeDefined();
  });

  it('renders a "Courses" link back to /app', async () => {
    await renderHeader({
      title: '3D Airmanship',
      moduleCount: 12,
      lessonCount: 87,
      coursePercent: 42,
    });
    const backLink = screen.getByRole('link', { name: 'Courses' });
    expect(backLink.getAttribute('href')).toBe('/app');
  });
});
