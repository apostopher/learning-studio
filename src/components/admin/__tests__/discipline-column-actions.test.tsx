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
    onUpdateLevels: vi.fn(),
    onAddLesson: vi.fn(),
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
      screen.getByRole('button', { name: 'Add a lesson to Weather' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add a module to Weather' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Weather' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Weather' })).toBeTruthy();
  });

  /**
   * With no Untitled heading to carry it, the column header is the only
   * place to add a root-level lesson — and the only way to add a lesson at
   * all to a discipline that has no modules yet.
   */
  it('has exactly five actions: levels, add a lesson, add a module, edit, delete', () => {
    renderActions();
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Update levels in Weather',
      'Add a lesson to Weather',
      'Add a module to Weather',
      'Edit Weather',
      'Delete Weather',
    ]);
  });

  it('calls each handler from its own button', () => {
    // Mutant: `onRename` and `onDelete` wired to the wrong buttons — every
    // button still renders and still fires something, so a test that only
    // asserted "some handler was called" would pass.
    const handlers = renderActions();

    fireEvent.click(
      screen.getByRole('button', { name: 'Update levels in Weather' }),
    );
    expect(handlers.onUpdateLevels).toHaveBeenCalledTimes(1);
    expect(handlers.onAddLesson).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add a lesson to Weather' }),
    );
    expect(handlers.onAddLesson).toHaveBeenCalledTimes(1);
    expect(handlers.onAddModule).not.toHaveBeenCalled();

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
