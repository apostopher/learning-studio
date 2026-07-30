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
import { LessonLink } from '../lesson-link';

async function renderInRouter(ui: React.ReactNode, initialPath = '/') {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
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
  const routeTree = rootRoute.addChildren([indexRoute, lessonRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const result = render(<RouterProvider router={router} />);
  // Wait for router to complete initial routing
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

const lesson = {
  slug: 'pitch-and-roll',
  name: 'Pitch and roll',
  videoId: null,
};

// The lock glyph is the only `aria-hidden` span in the row that wraps an svg:
// the rank span is aria-hidden but holds text, and CircularProgress puts
// aria-hidden on the svg itself, inside a role="progressbar" span. Selecting
// structurally rather than by role because the icon must NOT expose a role —
// see the double-announcement test below.
const LOCK_ICON_SELECTOR = 'span[aria-hidden="true"] > svg';

describe('LessonLink', () => {
  it('renders a link to the lesson route', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    expect(link.getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/fundamentals/lessons/pitch-and-roll',
    );
    expect(link.hasAttribute('aria-current')).toBe(false);
    expect(link.className).not.toContain('sidebar-row-active');
  });

  it('marks the link as current and applies the active class when isActive is true', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive
        progressPercent={0}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('sidebar-row-active');
  });

  it('always applies the focus-ring class', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    expect(link.className).toContain('sidebar-focus-ring');
  });

  it('renders no lock affordance when lock is absent', async () => {
    const { container } = await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
      />,
    );
    expect(container.querySelector(LOCK_ICON_SELECTOR)).toBeNull();
  });

  it('renders no lock affordance when lock is open', async () => {
    const { container } = await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
        lock={{ kind: 'open' }}
      />,
    );
    expect(container.querySelector(LOCK_ICON_SELECTOR)).toBeNull();
  });

  it('states the reason as visible text, not just an icon, for a lesson-locked row', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
        lock={{
          kind: 'lesson-locked',
          lessonSlug: 'intro',
          moduleSlug: 'fundamentals',
          lessonName: 'Intro',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    // Visible on the row, not hidden behind a hover-only title.
    expect(link.textContent).toContain('Finish Intro first');
    expect(link.querySelector(LOCK_ICON_SELECTOR)).not.toBeNull();
  });

  it('states the reason exactly once in the accessible name', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
        lock={{
          kind: 'lesson-locked',
          lessonSlug: 'intro',
          moduleSlug: 'fundamentals',
          lessonName: 'Intro',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    // The visible <span> and the icon both sat inside this one link, and the
    // icon carried aria-label={reason} + role="img", so the row's accessible
    // name announced "…Finish Intro first Finish Intro first".
    expect(link.textContent?.match(/Finish Intro first/g)).toHaveLength(1);
    // Nothing inside the row may contribute the reason a second time through
    // an aria-label or title. (CircularProgress legitimately carries its own,
    // unrelated aria-label, so this filters on the reason text rather than
    // banning labelled descendants outright.)
    const repeats = Array.from(
      link.querySelectorAll('[aria-label], [title]'),
    ).filter((el) =>
      `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`.includes(
        'Finish Intro first',
      ),
    );
    expect(repeats).toEqual([]);
  });

  it('states the reason for a module-locked row', async () => {
    await renderInRouter(
      <LessonLink
        courseSlug="3d-airmanship"
        moduleSlug="fundamentals"
        lesson={lesson}
        rank={1}
        isActive={false}
        progressPercent={0}
        lock={{
          kind: 'module-locked',
          moduleSlug: 'intro',
          moduleName: 'Intro',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /Pitch and roll/ });
    expect(link.textContent).toContain('Finish the Intro module first');
  });
});
