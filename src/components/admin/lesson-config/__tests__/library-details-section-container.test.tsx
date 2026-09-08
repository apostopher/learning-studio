// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryDetailsSectionContainer } from '../library-details-section-container';

const mutate = vi.hoisted(() => vi.fn());
vi.mock('#/data-hooks/use-update-library-lesson', () => ({
  useUpdateLibraryLesson: () => ({ mutate, isPending: false }),
}));

afterEach(() => {
  mutate.mockClear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const lesson = { id: 1, name: 'Approach briefing', isAvailable: true };

/**
 * Mounted the way `LibraryLessonConfigDialogContainer` mounts it — keyed on
 * the lesson id. The key IS the reseeding mechanism now, so a test that left
 * it out would be testing a composition that does not ship.
 */
const Section = ({ lesson: l }: { lesson: typeof lesson }) => (
  <LibraryDetailsSectionContainer key={l.id} lesson={l} />
);

const nameField = () =>
  screen.getByLabelText('Lesson name') as HTMLInputElement;

describe('LibraryDetailsSectionContainer', () => {
  /**
   * The regression this file exists for.
   *
   * The name field used to be reseeded by an effect keyed on `lesson.name`, so
   * ANY refetch that re-delivered the row — a background revalidation, another
   * admin's edit landing in the cache — reset the field under the cursor and
   * threw away what was being typed.
   */
  it('keeps what the admin is typing when the row is re-delivered with a new name', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Section lesson={lesson} />, { wrapper });

    await user.clear(nameField());
    await user.type(nameField(), 'Approach briefing v2');

    // The SAME lesson, re-delivered with a different name — another admin's
    // rename landing in the query cache, or a background revalidation. This
    // is the exact input the old effect reset on, mid-keystroke.
    rerender(
      <Section lesson={{ ...lesson, name: 'Renamed by someone else' }} />,
    );

    expect(nameField().value).toBe('Approach briefing v2');
  });

  // Two lessons can share a name, so the identity of the row is what has to
  // drive the reseed — not the text in it.
  it('reseeds when the modal is pointed at a different lesson', () => {
    const { rerender } = render(<Section lesson={lesson} />, { wrapper });
    expect(nameField().value).toBe('Approach briefing');

    rerender(
      <Section
        lesson={{ id: 2, name: 'Departure briefing', isAvailable: true }}
      />,
    );

    expect(nameField().value).toBe('Departure briefing');
  });

  it('submits the typed name', async () => {
    const user = userEvent.setup();
    render(<Section lesson={lesson} />, { wrapper });

    await user.clear(nameField());
    await user.type(nameField(), 'Renamed');
    await user.click(screen.getByRole('button', { name: /save|rename/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 1, name: 'Renamed' }),
      expect.anything(),
    );
  });
});
