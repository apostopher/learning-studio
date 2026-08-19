// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedLessonsSection } from '../archived-lessons-section';

async function renderInRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
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
  { slug: 'a', moduleSlug: 'fundamentals', name: 'Lesson A' },
  { slug: 'b', moduleSlug: 'intermediate-mod', name: 'Lesson B' },
];

describe('ArchivedLessonsSection', () => {
  it('renders nothing when there are no archived lessons', async () => {
    await renderInRouter(
      <ArchivedLessonsSection
        courseSlug="3d-airmanship"
        lessons={[]}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the count in the trigger and stays collapsed by default', async () => {
    await renderInRouter(
      <ArchivedLessonsSection
        courseSlug="3d-airmanship"
        lessons={lessons}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Completed at earlier levels (2)' }),
    ).toBeTruthy();
    // Base UI keeps the panel unmounted by default when closed — nothing to
    // find until it opens.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lists each archived lesson linking to its own module and lesson slug when open', async () => {
    await renderInRouter(
      <ArchivedLessonsSection
        courseSlug="3d-airmanship"
        lessons={lessons}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/fundamentals/lessons/a',
    );
    expect(links[0].textContent).toBe('Lesson A');
    expect(links[1].getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/intermediate-mod/lessons/b',
    );
  });

  it('calls onOpenChange when the trigger is pressed', async () => {
    const onOpenChange = vi.fn();
    await renderInRouter(
      <ArchivedLessonsSection
        courseSlug="3d-airmanship"
        lessons={lessons}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Completed at earlier levels (2)' }),
    );
    // Base UI's Collapsible also passes an event-details object as a second
    // argument — only the open/closed boolean is this test's concern.
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(true);
  });
});
