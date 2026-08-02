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
import { CourseHeaderNav } from '../course-header-nav';

/**
 * A stand-in for the real route tree — same paths, no loaders. The nav resolves
 * its highlight through the router (`useMatchRoute`), so it cannot be tested
 * without one.
 */
async function renderNavAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug',
    component: () => (
      <>
        <CourseHeaderNav courseSlug="itps" />
        <Outlet />
      </>
    ),
  });
  const leaf = (path: string) =>
    createRoute({
      getParentRoute: () => courseRoute,
      path,
      component: () => null,
    });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      courseRoute.addChildren([
        leaf('/modules/'),
        leaf('/news'),
        leaf('/library'),
        leaf('/settings'),
        leaf('/modules/$moduleSlug/lessons/$lessonSlug'),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one
  render(<RouterProvider router={router as any} />);
  await waitFor(() => expect(screen.getByRole('navigation')).toBeDefined());
  return router;
}

/** The item currently carrying the highlight, by its visible label. */
const highlighted = () =>
  screen
    .getByRole('navigation')
    .querySelector('[data-current]')
    ?.textContent?.trim();

describe('CourseHeaderNav', () => {
  it('highlights the section matching the current URL', async () => {
    await renderNavAt('/course/itps/library');
    expect(highlighted()).toBe('Library');
  });

  it('highlights Settings on the settings URL', async () => {
    await renderNavAt('/course/itps/settings');
    expect(highlighted()).toBe('Settings');
  });

  /**
   * Modules sends the learner to a lesson, so the nav has to stay lit on
   * Modules once they arrive — otherwise the highlight vanishes the moment the
   * navigation it started completes.
   */
  it('keeps Modules highlighted on a lesson page', async () => {
    await renderNavAt('/course/itps/modules/m1/lessons/l1');
    expect(highlighted()).toBe('Modules');
  });

  it('highlights exactly one item, so two pills never mount at once', async () => {
    await renderNavAt('/course/itps/library');
    expect(
      screen.getByRole('navigation').querySelectorAll('[data-current]'),
    ).toHaveLength(1);
  });

  /** The reported bug: the highlight must FOLLOW a navigation. */
  it('moves the highlight when the route changes', async () => {
    const router = await renderNavAt('/course/itps/library');
    expect(highlighted()).toBe('Library');

    await router.navigate({
      to: '/course/$courseSlug/settings',
      params: { courseSlug: 'itps' },
    });

    await waitFor(() => expect(highlighted()).toBe('Settings'));
  });
});
