// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  ),
}));

import { LessonHeading } from '../lesson-heading';

const base = {
  name: 'Welcome Intro',
  isAvailable: true,
  isRenaming: false,
  isSaving: false,
  onStartRename: vi.fn(),
  onCancelRename: vi.fn(),
  onToggleAvailability: vi.fn(),
  renameForm: null,
};

describe('LessonHeading', () => {
  it('shows the name as the heading with a pencil to rename, and the eye stating what a click does', () => {
    const onStartRename = vi.fn();
    const onToggleAvailability = vi.fn();
    render(
      <LessonHeading
        {...base}
        onStartRename={onStartRename}
        onToggleAvailability={onToggleAvailability}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Welcome Intro' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rename lesson' }));
    expect(onStartRename).toHaveBeenCalledOnce();
    // Reason + remedy in the accessible name: what it IS and what the click does.
    const eye = screen.getByRole('button', {
      name: 'Published — hide from learners',
    });
    fireEvent.click(eye);
    expect(onToggleAvailability).toHaveBeenCalledOnce();
  });

  it('names the draft state the other way round', () => {
    render(<LessonHeading {...base} isAvailable={false} />);
    expect(
      screen.getByRole('button', { name: 'Draft — show to learners' }),
    ).toBeTruthy();
  });

  it('while renaming, swaps the heading for the form with Save and Cancel, and no pencil', () => {
    const onCancelRename = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <LessonHeading
        {...base}
        isRenaming
        onCancelRename={onCancelRename}
        renameForm={{
          onSubmit,
          registerName: { name: 'name' } as never,
          error: undefined,
        }}
      />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByLabelText('Lesson name')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename lesson' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelRename).toHaveBeenCalledOnce();
  });
});
