// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleAccordion } from '../module-accordion';

const modules = [
  {
    id: 1,
    name: 'Fundamentals',
    slug: 'fundamentals',
    lessons: [{ slug: 'pitch', name: 'Pitch', videoId: null }],
  },
  {
    id: 2,
    name: 'Intermediate',
    slug: 'intermediate',
    lessons: [{ slug: 'yaw', name: 'Yaw', videoId: null }],
  },
];

async function renderIn(
  openModuleSlug: string | null,
  onOpenChange: (slug: string | null) => void,
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ModuleAccordion
        modules={modules}
        openModuleSlug={openModuleSlug}
        onOpenChange={onOpenChange}
        activeLessonSlug={null}
        lessonPercents={{}}
        modulePercents={{}}
      />
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

describe('ModuleAccordion', () => {
  it('renders one ModuleItem per module', async () => {
    await renderIn(null, () => {});
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('calls onOpenChange with the clicked slug when a closed item is opened', async () => {
    const onOpenChange = vi.fn();
    await renderIn(null, onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: /Fundamentals/ }));
    expect(onOpenChange).toHaveBeenCalledWith('fundamentals');
  });

  it('calls onOpenChange with null when the open item is clicked again', async () => {
    const onOpenChange = vi.fn();
    await renderIn('fundamentals', onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: /Fundamentals/ }));
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });
});
