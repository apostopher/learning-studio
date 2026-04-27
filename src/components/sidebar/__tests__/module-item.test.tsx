// @vitest-environment jsdom
import { Accordion } from '@base-ui/react/accordion';
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
import { ModuleItem } from '../module-item';

const module = {
  id: 1,
  name: 'Fundamentals',
  slug: 'fundamentals',
  lessons: [
    { slug: 'pitch', name: 'Pitch', videoId: null },
    { slug: 'roll', name: 'Roll', videoId: null },
  ],
};

async function renderInside(rank: number, activeLessonSlug: string | null) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <Accordion.Root>
        <ModuleItem
          module={module}
          rank={rank}
          isOpen={false}
          activeLessonSlug={activeLessonSlug}
          modulePercent={0}
          lessonPercents={{}}
        />
      </Accordion.Root>
    ),
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

describe('ModuleItem', () => {
  it('renders a trigger with zero-padded rank and module name', async () => {
    await renderInside(3, null);
    const trigger = screen.getByRole('button', { name: /Fundamentals/ });
    expect(trigger.textContent).toContain('03');
    expect(trigger.textContent).toContain('Fundamentals');
  });

  it('applies the focus-ring class on the trigger', async () => {
    await renderInside(1, null);
    const trigger = screen.getByRole('button', { name: /Fundamentals/ });
    expect(trigger.className).toContain('sidebar-focus-ring');
  });

  it('includes a chevron with the sidebar-chevron class', async () => {
    const { container } = await renderInside(1, null);
    expect(container.querySelector('.sidebar-chevron')).not.toBeNull();
  });
});
