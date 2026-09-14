// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCourseAtom } from '#/atoms/admin';

const mocks = vi.hoisted(() => ({ useDeleteCourse: vi.fn() }));
// Keep the real `CourseRequestError` class — the dialog's `instanceof` check
// is exactly what's under test — but stub the hook itself so the mutation
// state (isError/error) can be driven directly, without a fetch.
vi.mock('#/data-hooks/use-delete-course', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#/data-hooks/use-delete-course')>();
  return {
    CourseRequestError: actual.CourseRequestError,
    useDeleteCourse: mocks.useDeleteCourse,
  };
});
// Full stub, not importOriginal: pulling in the real router drags the
// generated route tree into this component test for no benefit — same
// pattern as use-sign-out.test.tsx.
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

import { CourseRequestError } from '#/data-hooks/use-delete-course';
import { DeleteCourseDialogContainer } from '../delete-course-dialog-container';

function renderDialog() {
  const store = createStore();
  store.set(deleteCourseAtom, { id: 6, name: '3D Airmanship' });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  return render(<DeleteCourseDialogContainer />, { wrapper });
}

beforeEach(() => {
  mocks.useDeleteCourse.mockReset();
});

describe('DeleteCourseDialogContainer', () => {
  /**
   * The whole point of the 409 refusal (Task 3): the admin must see WHY the
   * delete was refused and WHAT unlocks it, not a generic failure. Mutant
   * this catches: the `instanceof CourseRequestError && status === 409`
   * check dropped (or narrowed to always-false) — the exact sentence the
   * server composed would then be silently replaced by the generic copy.
   */
  it('renders the exact 409 refusal sentence from the server', () => {
    mocks.useDeleteCourse.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: true,
      error: new CourseRequestError(
        '2 other courses remix this course. Un-remix it from each of them first, then delete it.',
        409,
        2,
      ),
    });

    renderDialog();

    expect(
      screen.getByText(
        '2 other courses remix this course. Un-remix it from each of them first, then delete it.',
      ),
    ).toBeTruthy();
  });

  /** Any other failure (network, 500, …) falls back to the generic copy. */
  it('renders the generic message for a non-refusal error', () => {
    mocks.useDeleteCourse.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error('x'),
    });

    renderDialog();

    expect(
      screen.getByText('Could not delete. Please try again.'),
    ).toBeTruthy();
    expect(screen.queryByText(/other courses remix this course/)).toBeNull();
  });
});
