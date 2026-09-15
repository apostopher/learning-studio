// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// TooltipIconButton needs a Base UI `Tooltip.Provider` ancestor and renders
// its label into a portal-only popup — stubbed to a plain button keyed by its
// accessible name, matching `module-accordion-item.test.tsx`.
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

import { LibraryUntitled } from '../library-untitled';

describe('LibraryUntitled', () => {
  it('is titled Untitled, holds what it is given, and offers no rename, delete, or handle', () => {
    render(
      <LibraryUntitled lessonCount={2}>
        <p>card a</p>
        <p>card b</p>
      </LibraryUntitled>,
    );
    expect(screen.getByText('Untitled')).toBeTruthy();
    expect(screen.getByText('2 lessons')).toBeTruthy();
    expect(screen.getByText('card a')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('says every lesson is in a module when empty', () => {
    render(<LibraryUntitled lessonCount={0} />);
    expect(screen.getByText('Every lesson is in a module')).toBeTruthy();
  });

  /**
   * The one control Untitled may carry: "Add lesson", the same action a
   * module header offers, so a discipline with no modules yet can still
   * grow. It is the ONLY button — rename/delete/handle stay absent.
   */
  it('offers Add lesson when given the callback, and nothing else', () => {
    const onAddLesson = vi.fn();
    render(<LibraryUntitled lessonCount={0} onAddLesson={onAddLesson} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Add lesson to Untitled',
    ]);
    fireEvent.click(buttons[0]);
    expect(onAddLesson).toHaveBeenCalledOnce();
  });
});
