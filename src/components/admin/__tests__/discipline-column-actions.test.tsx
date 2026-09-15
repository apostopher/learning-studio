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

import { DisciplineColumnActions } from '../discipline-column-actions';

function renderActions(overrides: { canManage?: boolean } = {}) {
  const handlers = {
    onAddModule: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <DisciplineColumnActions
      disciplineName="Weather"
      canManage={overrides.canManage ?? true}
      {...handlers}
    />,
  );
  return handlers;
}

describe('DisciplineColumnActions', () => {
  it('names the discipline in every action, not just the verb', () => {
    // Mutant: labels hardcoded to "Add module" / "Rename" / "Delete". The
    // library shows many of these rows side by side, so a bare verb tells a
    // screen-reader user nothing about WHICH column is about to be deleted.
    renderActions();
    expect(
      screen.getByRole('button', { name: 'Add a module to Weather' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Weather' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Weather' })).toBeTruthy();
  });

  /**
   * Lessons are added from inside a module (or Untitled), the way the course
   * rail adds lessons from inside a course module — the column bar's "+" is
   * the module, and there is no column-level "add lesson" to mis-file one.
   */
  it('has exactly three actions: add a module (first), edit, delete', () => {
    renderActions();
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Add a module to Weather', 'Edit Weather', 'Delete Weather']);
  });

  it('calls each handler from its own button', () => {
    // Mutant: `onRename` and `onDelete` wired to the wrong buttons — every
    // button still renders and still fires something, so a test that only
    // asserted "some handler was called" would pass.
    const handlers = renderActions();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add a module to Weather' }),
    );
    expect(handlers.onAddModule).toHaveBeenCalledTimes(1);
    expect(handlers.onRename).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Weather' }));
    expect(handlers.onRename).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weather' }));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it('withholds rename and delete from an actor who cannot manage disciplines', () => {
    // Mutant: `canManage` ignored, or applied to add-module instead. Both
    // halves are asserted: the two admin-only actions must be GONE, and the
    // authoring action must REMAIN — a mutant that hid all three would
    // otherwise pass the first half.
    const handlers = renderActions({ canManage: false });

    expect(screen.queryByRole('button', { name: 'Edit Weather' })).toBe(null);
    expect(screen.queryByRole('button', { name: 'Delete Weather' })).toBe(null);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a module to Weather' }),
    );
    expect(handlers.onAddModule).toHaveBeenCalledTimes(1);
  });
});
