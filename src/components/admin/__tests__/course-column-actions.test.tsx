// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// TooltipIconButton needs a Base UI `Tooltip.Provider` ancestor and renders
// its label into a portal-only popup — stubbed to a plain button keyed by its
// accessible name, matching `discipline-column-actions.test.tsx`.
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

import { CourseColumnActions } from '../course-column-actions';

function renderActions(
  overrides: { canEditCourse?: boolean; canDeleteCourse?: boolean } = {},
) {
  const handlers = {
    onAddModule: vi.fn(),
    onEditCourse: vi.fn(),
    onDeleteCourse: vi.fn(),
  };
  render(
    <CourseColumnActions
      courseName="2 Week Intensive"
      canEditCourse={overrides.canEditCourse ?? true}
      canDeleteCourse={overrides.canDeleteCourse ?? true}
      {...handlers}
    />,
  );
  return handlers;
}

describe('CourseColumnActions', () => {
  it('names the course in every action, not just the verb', () => {
    // Mutant: labels hardcoded to "Add module" / "Edit course" / "Delete
    // course". The rail holds several columns side by side, so a bare verb
    // tells a screen-reader user nothing about WHICH course is about to be
    // deleted.
    renderActions();
    expect(
      screen.getByRole('button', { name: 'Add a module to 2 Week Intensive' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit 2 Week Intensive' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Delete 2 Week Intensive' }),
    ).toBeTruthy();
  });

  it('calls each handler from its own button', () => {
    // Mutant: `onEditCourse` and `onDeleteCourse` wired to the wrong buttons.
    // Every button still renders and still fires something, so a test that
    // only asserted "some handler was called" would pass — while the pencil
    // opened a delete confirmation.
    const handlers = renderActions();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add a module to 2 Week Intensive' }),
    );
    expect(handlers.onAddModule).toHaveBeenCalledTimes(1);
    expect(handlers.onEditCourse).not.toHaveBeenCalled();
    expect(handlers.onDeleteCourse).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit 2 Week Intensive' }),
    );
    expect(handlers.onEditCourse).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteCourse).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 2 Week Intensive' }),
    );
    expect(handlers.onDeleteCourse).toHaveBeenCalledTimes(1);
  });

  it('gates edit and delete independently, and never gates add-module', () => {
    // Three claims in one, because they are one rule: `course:update` and
    // `course:delete` are separate grants, while adding a MODULE is
    // course-scoped `structure` work the router context cannot answer — so it
    // is always offered and the server refuses if it must.
    const handlers = renderActions({
      canEditCourse: true,
      canDeleteCourse: false,
    });

    expect(
      screen.getByRole('button', { name: 'Edit 2 Week Intensive' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Delete 2 Week Intensive' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a module to 2 Week Intensive' }),
    );
    expect(handlers.onAddModule).toHaveBeenCalledTimes(1);
  });

  it('offers add-module alone to someone holding neither course grant', () => {
    // Mutant: one flag gating both controls, or the add-module button being
    // swept up in the same gate — which would leave a course manager, who
    // holds structure but neither course grant, with nothing to click.
    renderActions({ canEditCourse: false, canDeleteCourse: false });

    expect(
      screen.queryByRole('button', { name: 'Edit 2 Week Intensive' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete 2 Week Intensive' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add a module to 2 Week Intensive' }),
    ).toBeTruthy();
  });
});
