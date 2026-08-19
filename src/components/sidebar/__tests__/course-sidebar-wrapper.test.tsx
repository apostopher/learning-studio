// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

// Defaults to a settled 'basic' level with no pending change, so every test
// that does not care about levels still exercises filterCourseToLevel (with
// fixture lessons carrying `levels: []`, i.e. visible to everyone) rather
// than accidentally short-circuiting on a still-loading level query.
const levelMock = vi.fn<() => { data: unknown; isError: boolean }>(() => ({
  data: { level: 'basic', pendingChange: null },
  isError: false,
}));
vi.mock('../../../data-hooks/use-my-level', () => ({
  useMyLevel: () => levelMock(),
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
      lessons: [{ slug: 'pitch', name: 'Pitch', hasVideo: false, levels: [] }],
    },
    {
      id: 2,
      slug: 'intermediate',
      name: 'Intermediate',
      lessons: [
        { slug: 'yaw', name: 'Yaw', hasVideo: false, levels: [] },
        { slug: 'roll', name: 'Roll', hasVideo: false, levels: [] },
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
          levels: [],
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
          levels: [],
        },
        {
          id: 3,
          slug: 'roll',
          name: 'Roll',
          hasVideo: true,
          isAvailable: true,
          needsVideoWatch: true,
          dependsOn: [{ lessonSlug: 'yaw', moduleSlug: 'intermediate' }],
          levels: [],
        },
      ],
    },
  ],
};

const leveledCourse = {
  id: 1,
  slug: '3d-airmanship',
  name: '3D Airmanship',
  modules: [
    {
      id: 1,
      slug: 'fundamentals',
      name: 'Fundamentals',
      lessons: [{ slug: 'pitch', name: 'Pitch', hasVideo: false, levels: [] }],
    },
    {
      id: 2,
      slug: 'advanced-only',
      name: 'Advanced Only',
      lessons: [
        {
          slug: 'vortex',
          name: 'Vortex Recovery',
          hasVideo: false,
          levels: ['advanced'],
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
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
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

  it('hides a lesson outside the pilot level and drops its module when it was the only lesson', async () => {
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
    await renderAt('/', {
      data: leveledCourse,
      isLoading: false,
      isError: false,
    });
    expect(screen.getByText('1 module · 1 lesson')).toBeDefined();
    expect(screen.queryByText('Advanced Only')).toBeNull();
    expect(screen.queryByText('Vortex Recovery')).toBeNull();
  });

  it('shows an out-of-tier lesson to an admin, bypassing the level filter', async () => {
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
    await renderAt(
      '/',
      { data: leveledCourse, isLoading: false, isError: false },
      ['admin'],
    );
    expect(screen.getByText('2 modules · 2 lessons')).toBeDefined();
    expect(screen.getByText('Advanced Only')).toBeDefined();
  });

  it('treats the sidebar as still loading while the level query is pending, never rendering the unfiltered course', async () => {
    // Course details have already arrived; only the level query hasn't. If
    // visibleDetails fell back to the raw payload here, this would render
    // "Advanced Only" (and hand it to computeLessonLocks) before the level
    // query settles.
    levelMock.mockReturnValue({ data: undefined, isError: false });
    const { container } = await renderAt('/', {
      data: leveledCourse,
      isLoading: false,
      isError: false,
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Advanced Only')).toBeNull();
  });

  it('shows the level badge for a non-admin pilot', async () => {
    levelMock.mockReturnValue({
      data: { level: 'intermediate', pendingChange: null },
      isError: false,
    });
    await renderAt('/', { data: fakeCourse, isLoading: false, isError: false });
    // fakeCourse also has a MODULE named "Intermediate" — scope the query to
    // the header, where the badge actually renders, to disambiguate.
    const header = screen.getByRole('heading', { level: 2 }).closest('header');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByText('Intermediate'),
    ).toBeDefined();
  });

  it('shows no level badge for an admin (bypasses the level system entirely)', async () => {
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
    await renderAt(
      '/',
      { data: fakeCourse, isLoading: false, isError: false },
      ['admin'],
    );
    expect(screen.queryByText('Basic')).toBeNull();
  });

  // A dedicated fixture (not leveledCourse, which omits dependsOn/
  // sequentialLessons/isAvailable/needsVideoWatch) — these two tests are the
  // first in this file to give computeLessonLocks a genuinely non-empty
  // progress payload against a level-gated course, which exercises
  // toGateCourse's real field requirements.
  const archivableCourse = {
    id: 1,
    slug: '3d-airmanship',
    name: '3D Airmanship',
    modules: [
      {
        id: 1,
        slug: 'fundamentals',
        name: 'Fundamentals',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          {
            id: 1,
            slug: 'pitch',
            name: 'Pitch',
            hasVideo: false,
            isAvailable: true,
            needsVideoWatch: true,
            dependsOn: [],
            levels: [],
          },
        ],
      },
      {
        id: 2,
        slug: 'advanced-only',
        name: 'Advanced Only',
        dependsOn: [],
        sequentialLessons: false,
        lessons: [
          {
            id: 11,
            slug: 'vortex',
            name: 'Vortex Recovery',
            hasVideo: false,
            isAvailable: true,
            needsVideoWatch: true,
            dependsOn: [],
            levels: ['advanced'],
          },
        ],
      },
    ],
  };

  it('lists a completed out-of-tier lesson in the archive disclosure, and opens it on click', async () => {
    // 'vortex' (module 'advanced-only') has levels: ['advanced'] — invisible
    // to a 'basic' pilot — and progress marks it 100% complete.
    progressMock.mockReturnValue({
      data: {
        lessons: [{ lessonId: 11, moduleId: 2, percent: 100, watched: true }],
        modules: [],
      },
    });
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
    await renderAt('/', {
      data: archivableCourse,
      isLoading: false,
      isError: false,
    });
    // Still filtered out of the main tree.
    expect(screen.queryByText('Vortex Recovery')).toBeNull();
    // But reachable via the archive disclosure.
    fireEvent.click(
      screen.getByRole('button', { name: /Completed at earlier levels/ }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Vortex Recovery' }),
      ).toBeDefined();
    });
    expect(
      screen
        .getByRole('link', { name: 'Vortex Recovery' })
        .getAttribute('href'),
    ).toBe('/course/3d-airmanship/modules/advanced-only/lessons/vortex');
  });

  it('does not archive an out-of-tier lesson that was never completed', async () => {
    progressMock.mockReturnValue({
      data: {
        lessons: [{ lessonId: 11, moduleId: 2, percent: 40, watched: false }],
        modules: [],
      },
    });
    levelMock.mockReturnValue({
      data: { level: 'basic', pendingChange: null },
      isError: false,
    });
    await renderAt('/', {
      data: archivableCourse,
      isLoading: false,
      isError: false,
    });
    expect(
      screen.queryByRole('button', { name: /Completed at earlier levels/ }),
    ).toBeNull();
  });
});
