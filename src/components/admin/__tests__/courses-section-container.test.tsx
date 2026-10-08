// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider, useAtomValue } from 'jotai';
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

// The real button needs a Tooltip.Provider; a plain button keeps its name and
// click, which is all this test reads.
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));
// Stands in for the modal by reading the same atom it reads, so the assertion
// is on what the modal would receive — not on the atom being set.
vi.mock('../edit-course-dialog-container', async () => {
  const { editCourseAtom } = await import('#/atoms/admin');
  return {
    EditCourseDialogContainer: () => {
      const target = useAtomValue(editCourseAtom);
      return (
        <output data-testid="edit-dialog">
          {target ? JSON.stringify(target) : ''}
        </output>
      );
    },
  };
});

import { AdminCoursesRequestError } from '#/data-hooks/use-admin-courses';
import { CoursesSectionContainer } from '../courses-section-container';

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={createStore()}>
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  </Provider>
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
          description: null,
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
          description: null,
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

  const COURSE = {
    id: 6,
    name: '3D Airmanship',
    slug: '3d-airmanship',
    description: 'Upset recovery from first principles.',
    imageUrlAvif: 'https://blob.example/cover.avif',
    imageUrlWebp: 'https://blob.example/cover.webp',
    updatedAt: new Date(),
    moduleCount: 7,
    lessonCount: 23,
  };

  it('hands the edit modal the course it was opened on, description included', () => {
    hook.useAdminCourses.mockReturnValue({
      data: [COURSE],
      isLoading: false,
      error: null,
    });
    render(<CoursesSectionContainer canEditCourse />, { wrapper });

    expect(screen.getByTestId('edit-dialog').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Edit 3D Airmanship' }));
    // The description must reach the modal: it prefills the form from this
    // target, and a missing one would be saved back as blank.
    expect(
      JSON.parse(screen.getByTestId('edit-dialog').textContent ?? ''),
    ).toEqual({
      id: 6,
      name: '3D Airmanship',
      description: 'Upset recovery from first principles.',
      imageUrlAvif: 'https://blob.example/cover.avif',
      imageUrlWebp: 'https://blob.example/cover.webp',
    });
  });

  it('keeps the edit button outside the tile link', () => {
    hook.useAdminCourses.mockReturnValue({
      data: [COURSE],
      isLoading: false,
      error: null,
    });
    render(<CoursesSectionContainer canEditCourse />, { wrapper });
    const button = screen.getByRole('button', { name: 'Edit 3D Airmanship' });
    expect(button.closest('a')).toBeNull();
  });

  it('offers no edit button or modal without course:update', () => {
    hook.useAdminCourses.mockReturnValue({
      data: [COURSE],
      isLoading: false,
      error: null,
    });
    render(<CoursesSectionContainer />, { wrapper });
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByTestId('edit-dialog')).toBeNull();
  });
});
