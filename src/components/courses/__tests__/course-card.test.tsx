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
import { CourseCard } from '../course-card';

async function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug',
    component: () => null,
  });
  const lessonRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, courseRoute, lessonRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const result = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
  return result;
}

const course = {
  id: 1,
  name: '3D Airmanship',
  slug: '3d-airmanship',
  imageUrlAvif: null,
  imageUrlWebp: null,
  percent: 42,
  resume: { kind: 'none', reason: 'no-lessons' } as const,
};

describe('CourseCard', () => {
  it('links straight to the resume lesson when there is one', async () => {
    await renderInRouter(
      <CourseCard
        course={{
          ...course,
          resume: {
            kind: 'lesson',
            moduleSlug: 'navigation',
            lessonSlug: 'pilotage',
          },
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /3D Airmanship/ });
    expect(link.getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/navigation/lessons/pilotage',
    );
  });

  it('falls back to the course route when there is nothing to resume', async () => {
    await renderInRouter(<CourseCard course={course} />);
    const link = screen.getByRole('link', { name: /3D Airmanship/ });
    expect(link.getAttribute('href')).toBe('/course/3d-airmanship');
  });

  it('renders the course name', async () => {
    await renderInRouter(<CourseCard course={course} />);
    expect(screen.getByText('3D Airmanship')).toBeDefined();
  });

  it('shows a fallback icon when there is no cover image', async () => {
    await renderInRouter(<CourseCard course={course} />);
    expect(screen.getByTestId('cover-fallback')).toBeDefined();
  });

  it('renders the cover image instead of the fallback when one is set', async () => {
    await renderInRouter(
      <CourseCard
        course={{
          ...course,
          imageUrlAvif: 'https://example.test/cover.avif',
          imageUrlWebp: 'https://example.test/cover.webp',
        }}
      />,
    );
    expect(screen.queryByTestId('cover-fallback')).toBeNull();
    expect(
      screen.getByRole('img', { name: /3D Airmanship cover/ }),
    ).toBeDefined();
  });

  it('shows the progress value in an accessible label', async () => {
    await renderInRouter(<CourseCard course={course} />);
    const progress = screen.getByLabelText(/3D Airmanship.*progress/i);
    expect(progress.getAttribute('aria-valuenow')).toBe('42');
  });

  // The press/loading feedback is driven entirely by CSS keyed on these two
  // class names plus the data-transitioning attribute TanStack Router sets on
  // the Link. Nothing in JS reads them, so renaming either would silently
  // remove the feedback with every other test still green. These pin the
  // contract the stylesheet depends on.
  it('renders both the progress ring and the spinner for CSS to swap between', async () => {
    const { container } = await renderInRouter(<CourseCard course={course} />);
    expect(container.querySelector('.course-card__progress')).not.toBeNull();
    expect(container.querySelector('.course-card__spinner')).not.toBeNull();
  });

  it('hides the spinner from assistive tech, since the ring carries the label', async () => {
    const { container } = await renderInRouter(<CourseCard course={course} />);
    const spinner = container.querySelector('.course-card__spinner');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });
});
