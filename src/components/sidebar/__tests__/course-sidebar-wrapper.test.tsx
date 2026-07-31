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
import type { Atom } from 'jotai';
import { atom, createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../hooks/data/use-course-details', () => ({
  useCourseDetails: vi.fn(),
  courseDetailsAtomFamily: (() => detailsAtom) as (
    slug: string,
  ) => Atom<DetailsResult>,
}));

// A vi.fn() (not a static object) so individual tests can stand up a
// per-user progress payload and prove the wrapper actually threads it into
// the rendered rows, not just into unread state.
const progressMock = vi.fn<() => { data: unknown }>(() => ({
  data: undefined,
}));
vi.mock('../../../data-hooks/use-course-progress-summary', () => ({
  useCourseProgressSummary: () => progressMock(),
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
      lessons: [{ slug: 'pitch', name: 'Pitch', hasVideo: false }],
    },
    {
      id: 2,
      slug: 'intermediate',
      name: 'Intermediate',
      lessons: [
        { slug: 'yaw', name: 'Yaw', hasVideo: false },
        { slug: 'roll', name: 'Roll', hasVideo: false },
      ],
    },
  ],
};

const gatedCourse = {
  id: 1,
  slug: '3d-airmanship',
  name: '3D Airmanship',
  modules: [
    {
      id: 1,
      slug: 'fundamentals',
      name: 'Fundamentals',
      dependsOn: [],
      lessons: [
        {
          id: 1,
          slug: 'pitch',
          name: 'Pitch',
          hasVideo: true,
          isAvailable: true,
          needsVideoWatch: true,
          dependsOn: [],
        },
      ],
    },
    {
      id: 2,
      slug: 'intermediate',
      name: 'Intermediate',
      dependsOn: [],
      lessons: [
        {
          id: 2,
          slug: 'yaw',
          name: 'Yaw',
          hasVideo: true,
          isAvailable: true,
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 3,
          slug: 'roll',
          name: 'Roll',
          hasVideo: true,
          isAvailable: true,
          needsVideoWatch: true,
          dependsOn: [{ lessonSlug: 'yaw', moduleSlug: 'intermediate' }],
        },
      ],
    },
  ],
};

async function renderAt(
  path: string,
  details: DetailsResult,
  // The real root route's beforeLoad puts `roles` into the router context
  // (src/routes/__root.tsx); useIsAdmin reads it from there. Injecting it the
  // same way is the only honest way to prove the wrapper threads the flag
  // through to the rendered rows.
  roles: string[] = [],
) {
  const store = createStore();
  store.set(detailsAtom, details);

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ roles }),
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CourseSidebarWrapper courseSlug="3d-airmanship" />,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => <CourseSidebarWrapper courseSlug="3d-airmanship" />,
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
  beforeEach(() => {
    progressMock.mockReturnValue({ data: undefined });
  });

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
    await renderAt('/course/3d-airmanship/modules/intermediate/lessons/yaw', {
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

  it('shows a visible lock reason on a row whose prerequisite is unwatched, computed from the course payload and progress summary already fetched', async () => {
    progressMock.mockReturnValue({
      data: {
        lessons: [
          { lessonId: 2, watched: false },
          { lessonId: 3, watched: false },
        ],
        modules: [],
      },
    });
    await renderAt('/', {
      data: gatedCourse,
      isLoading: false,
      isError: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /Intermediate/ }));
    await waitFor(() => {
      expect(
        screen
          .queryAllByRole('link')
          .some((a) => a.getAttribute('href')?.includes('/lessons/roll')),
      ).toBe(true);
    });
    // Yaw's row carries no lock text of its own; Roll's does — identify each
    // by its href rather than by accessible name, since Roll's own row text
    // ("Finish Yaw first") would otherwise make a name-based query for "Yaw"
    // ambiguous between the two rows.
    const links = screen.getAllByRole('link');
    const yawLink = links.find((a) =>
      a.getAttribute('href')?.includes('/lessons/yaw'),
    );
    const rollLink = links.find((a) =>
      a.getAttribute('href')?.includes('/lessons/roll'),
    );
    expect(yawLink?.textContent).not.toContain('Finish');
    expect(rollLink?.textContent).toContain('Finish Yaw first');
  });

  it('shows an admin no lock reason on a row a student would see locked', async () => {
    // Identical inputs to the test above, which proves Roll's row DOES carry
    // "Finish Yaw first" for a non-admin. Admins bypass all three gates
    // server-side, so the row opened when they clicked it — the sidebar was
    // telling them something untrue.
    progressMock.mockReturnValue({
      data: {
        lessons: [
          { lessonId: 2, watched: false },
          { lessonId: 3, watched: false },
        ],
        modules: [],
      },
    });
    await renderAt(
      '/',
      { data: gatedCourse, isLoading: false, isError: false },
      ['admin'],
    );
    fireEvent.click(screen.getByRole('button', { name: /Intermediate/ }));
    await waitFor(() => {
      expect(
        screen
          .queryAllByRole('link')
          .some((a) => a.getAttribute('href')?.includes('/lessons/roll')),
      ).toBe(true);
    });
    const rollLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.includes('/lessons/roll'));
    expect(rollLink?.textContent).not.toContain('Finish');
  });

  it('opens the row once its prerequisite is watched', async () => {
    progressMock.mockReturnValue({
      data: {
        lessons: [
          { lessonId: 2, watched: true },
          { lessonId: 3, watched: false },
        ],
        modules: [],
      },
    });
    await renderAt('/', {
      data: gatedCourse,
      isLoading: false,
      isError: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /Intermediate/ }));
    await waitFor(() => {
      expect(
        screen
          .queryAllByRole('link')
          .some((a) => a.getAttribute('href')?.includes('/lessons/roll')),
      ).toBe(true);
    });
    const rollLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.includes('/lessons/roll'));
    expect(rollLink?.textContent).not.toContain('Finish');
  });
});
