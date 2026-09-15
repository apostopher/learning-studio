// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Completes synchronously, as a settled mutation would: the container leaves
// rename mode in `onSuccess`, which is what the first test watches for.
const mutate = vi.hoisted(() =>
  vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) =>
    opts?.onSuccess?.(),
  ),
);
vi.mock('#/data-hooks/use-update-library-lesson', () => ({
  useUpdateLibraryLesson: () => ({ mutate, isPending: false }),
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={label} onClick={onClick}>
      {label}
    </button>
  ),
}));

import { LibraryLessonHeadingContainer } from '../library-lesson-heading-container';

const renderIsolated = (ui: ReactElement) =>
  render(<Provider store={createStore()}>{ui}</Provider>);

afterEach(() => mutate.mockClear());

describe('LibraryLessonHeadingContainer', () => {
  it('renames through the mutation with the typed name, then leaves rename mode', async () => {
    renderIsolated(
      <LibraryLessonHeadingContainer
        lesson={{ id: 10, name: 'Welcome Intro', isAvailable: true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename lesson' }));
    const input = screen.getByLabelText('Lesson name') as HTMLInputElement;
    expect(input.value).toBe('Welcome Intro');
    fireEvent.change(input, { target: { value: 'Welcome & Intro' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await screen.findByRole('heading');
    expect(mutate).toHaveBeenCalledWith(
      { lessonId: 10, name: 'Welcome & Intro' },
      expect.anything(),
    );
  });

  it('does not write an unchanged name', async () => {
    renderIsolated(
      <LibraryLessonHeadingContainer
        lesson={{ id: 10, name: 'Welcome Intro', isAvailable: true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename lesson' }));
    fireEvent.submit(
      screen.getByLabelText('Lesson name').closest('form') as HTMLFormElement,
    );
    await screen.findByRole('heading');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('flips availability through the mutation', () => {
    renderIsolated(
      <LibraryLessonHeadingContainer
        lesson={{ id: 10, name: 'Welcome Intro', isAvailable: true }}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Published — hide from learners' }),
    );
    expect(mutate).toHaveBeenCalledWith(
      { lessonId: 10, isAvailable: false },
      expect.anything(),
    );
  });
});
