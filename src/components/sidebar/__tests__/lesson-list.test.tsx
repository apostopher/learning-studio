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
import { LessonList } from '../lesson-list';

async function renderInRouter(ui: React.ReactNode) {
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
  { slug: 'a', name: 'Lesson A', hasVideo: false },
  { slug: 'b', name: 'Lesson B', hasVideo: false },
  { slug: 'c', name: 'Lesson C', hasVideo: false },
];

describe('LessonList', () => {
  it('renders one LessonLink per lesson in a single <ul>', async () => {
    await renderInRouter(
      <LessonList
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lessons={lessons}
        lessonPercents={{}}
        lessonLocks={{}}
        activeLessonSlug={null}
      />,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks only the matching lesson as active', async () => {
    await renderInRouter(
      <LessonList
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lessons={lessons}
        lessonPercents={{}}
        lessonLocks={{}}
        activeLessonSlug="b"
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
    expect(links[2].getAttribute('aria-current')).toBeNull();
  });

  it("reflects each lesson's real percent from a slug-keyed lessonPercents map", async () => {
    await renderInRouter(
      <LessonList
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lessons={lessons}
        lessonPercents={{ a: 42, c: 100 }}
        lessonLocks={{}}
        activeLessonSlug={null}
      />,
    );
    const rings = screen.getAllByRole('progressbar');
    expect(rings[0].getAttribute('aria-valuenow')).toBe('42');
    expect(rings[1].getAttribute('aria-valuenow')).toBe('0');
    expect(rings[2].getAttribute('aria-valuenow')).toBe('100');
  });

  it('renders the honest no-data state (0%) for a lesson absent from lessonPercents', async () => {
    await renderInRouter(
      <LessonList
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lessons={lessons}
        lessonPercents={{ a: 42 }}
        lessonLocks={{}}
        activeLessonSlug={null}
      />,
    );
    const rings = screen.getAllByRole('progressbar');
    // b and c have no entry in lessonPercents at all — must not be confused
    // with a lesson that genuinely has 0 watched-milestones.
    expect(rings[1].getAttribute('aria-valuenow')).toBe('0');
    expect(rings[2].getAttribute('aria-valuenow')).toBe('0');
  });

  it("passes each lesson's lock from lessonLocks down to its LessonLink", async () => {
    await renderInRouter(
      <LessonList
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lessons={lessons}
        lessonPercents={{}}
        lessonLocks={{
          b: {
            kind: 'lesson-locked',
            lessonSlug: 'a',
            moduleSlug: 'fundamentals',
            lessonName: 'Lesson A',
          },
        }}
        activeLessonSlug={null}
      />,
    );
    const links = screen.getAllByRole('link');
    const [openLink, lockedLink] = links;
    expect(openLink.textContent).toContain('Lesson A');
    expect(openLink.textContent).not.toContain('Finish');
    expect(lockedLink.textContent).toContain('Lesson B');
    expect(lockedLink.textContent).toContain('Finish Lesson A first');
  });
});
