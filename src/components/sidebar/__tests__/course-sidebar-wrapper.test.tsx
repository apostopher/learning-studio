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
import { atom, Provider, createStore } from 'jotai';
import type { Atom } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

type DetailsResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
};

const detailsAtom = atom<DetailsResult>({
  data: undefined,
  isLoading: true,
  isError: false,
});

const emptyMapAtom = atom({} as Record<string, number>);
const emptyNumMapAtom = atom({} as Record<number, number>);

vi.mock('../../../hooks/data/use-course-details', () => ({
  useCourseDetails: vi.fn(),
  courseDetailsAtomFamily: (() => detailsAtom) as (slug: string) => Atom<DetailsResult>,
}));

vi.mock('../../../atoms/course-progress', () => ({
  lessonPercentsAtomFamily: (() => emptyMapAtom) as (
    slug: string,
  ) => Atom<Record<string, number>>,
  modulePercentsAtomFamily: (() => emptyNumMapAtom) as (
    slug: string,
  ) => Atom<Record<number, number>>,
}));

import { CourseSidebarWrapper } from '../course-sidebar-wrapper';

const fakeCourse = {
  id: 1,
  slug: '3d-airmanship',
  name: '3D Airmanship',
  modules: [
    {
      id: 1,
      slug: 'fundamentals',
      name: 'Fundamentals',
      lessons: [{ slug: 'pitch', name: 'Pitch', videoId: null }],
    },
    {
      id: 2,
      slug: 'intermediate',
      name: 'Intermediate',
      lessons: [
        { slug: 'yaw', name: 'Yaw', videoId: null },
        { slug: 'roll', name: 'Roll', videoId: null },
      ],
    },
  ],
};

async function renderAt(path: string, details: DetailsResult) {
  const store = createStore();
  store.set(detailsAtom, details);

  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CourseSidebarWrapper />,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => <CourseSidebarWrapper />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const result = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

describe('CourseSidebarWrapper', () => {
  it('renders the skeleton while loading', async () => {
    const { container } = await renderAt('/', {
      data: undefined,
      isLoading: true,
      isError: false,
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error when the query errors', async () => {
    await renderAt('/', {
      data: undefined,
      isLoading: false,
      isError: true,
    });
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders the error when data resolves to null', async () => {
    await renderAt('/', {
      data: null,
      isLoading: false,
      isError: false,
    });
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders header + modules when ready and marks the active lesson from the URL', async () => {
    await renderAt('/modules/intermediate/lessons/yaw', {
      data: fakeCourse,
      isLoading: false,
      isError: false,
    });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('2 modules · 3 lessons')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Intermediate/ }));
    await waitFor(() => {
      const yawLink = screen.getByRole('link', { name: /Yaw/ });
      expect(yawLink.getAttribute('aria-current')).toBe('page');
    });
  });
});
