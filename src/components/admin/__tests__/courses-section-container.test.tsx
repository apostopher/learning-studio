// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ useAdminCourses: vi.fn() }));
vi.mock('#/data-hooks/use-admin-courses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/data-hooks/use-admin-courses')>()),
  useAdminCourses: hook.useAdminCourses,
}));
// The router's Link needs a router; an anchor keyed by its resolved path is
// what this test asserts on — the tile must go to that course's editor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [k, v]) => path.replace(`$${k}`, v),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { AdminCoursesRequestError } from '#/data-hooks/use-admin-courses';
import { CoursesSectionContainer } from '../courses-section-container';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

afterEach(() => vi.clearAllMocks());

describe('CoursesSectionContainer', () => {
  it('renders one tile per course, each linking to that course’s editor', () => {
    hook.useAdminCourses.mockReturnValue({
      data: [
        {
          id: 6,
          name: '3D Airmanship',
          slug: '3d-airmanship',
          imageUrlAvif: null,
          imageUrlWebp: null,
          updatedAt: new Date(),
          moduleCount: 7,
          lessonCount: 23,
        },
        {
          id: 2,
          name: 'ITPS 2 Week',
          slug: 'itps',
          imageUrlAvif: null,
          imageUrlWebp: null,
          updatedAt: new Date(),
          moduleCount: 1,
          lessonCount: 4,
        },
      ],
      isLoading: false,
      error: null,
    });
    render(<CoursesSectionContainer />, { wrapper });
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/admin/6/editor',
      '/admin/2/editor',
    ]);
    expect(links[0].getAttribute('aria-label')).toBe(
      'Open 3D Airmanship in the editor',
    );
  });

  it('says why when the catalogue is refused, rather than showing an empty grid', () => {
    hook.useAdminCourses.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new AdminCoursesRequestError('Failed to load courses (403)', 403),
    });
    render(<CoursesSectionContainer />, { wrapper });
    expect(screen.getByRole('alert').textContent).toMatch(
      /not allowed to see the course catalogue/i,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says there are no courses yet when the list is empty', () => {
    hook.useAdminCourses.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    render(<CoursesSectionContainer />, { wrapper });
    expect(screen.getByText(/No courses yet/)).toBeTruthy();
  });
});
