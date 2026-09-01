// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisciplineColumn } from '../discipline-column';

describe('DisciplineColumn', () => {
  it('renders its name, its lesson count, and its children', () => {
    // Mutant: `children` is never rendered inside the ScrollArea (e.g. the
    // JSX drops `{children}`). This assertion fails against that mutant
    // because the passed-in card text would not be found.
    render(
      <DisciplineColumn name="UAS" lessonCount={3}>
        <span>Crosswind landings</span>
      </DisciplineColumn>,
    );
    expect(screen.getByText('UAS')).toBeTruthy();
    expect(screen.getByText('3 lessons')).toBeTruthy();
    expect(screen.getByText('Crosswind landings')).toBeTruthy();
  });

  it('uses the singular for exactly one lesson, not "1 lessons"', () => {
    // Mutant: the noun is hard-coded to "lessons" (no singular/plural
    // branch). This assertion fails against that mutant because the
    // rendered text becomes "1 lessons", which does not match the exact
    // string below.
    render(
      <DisciplineColumn name="Untitled" lessonCount={1}>
        <span>Solo lesson</span>
      </DisciplineColumn>,
    );
    expect(screen.getByText('1 lesson')).toBeTruthy();
    expect(screen.queryByText('1 lessons')).toBeNull();
  });

  it('renders its actions outside the scrolling lesson list', () => {
    // Mutant: `actions` rendered inside the ScrollArea alongside the lesson
    // cards, where the buttons would scroll away with them. Asserting only
    // that the action is somewhere in the document cannot see this, so this
    // asserts it is NOT a descendant of the element holding the children.
    render(
      <DisciplineColumn
        name="UAS"
        lessonCount={1}
        actions={<button type="button">Add a lesson to UAS</button>}
      >
        <span data-testid="lesson-card">Crosswind landings</span>
      </DisciplineColumn>,
    );
    const action = screen.getByRole('button', { name: 'Add a lesson to UAS' });
    const card = screen.getByTestId('lesson-card');
    expect(action).toBeTruthy();
    expect(card.parentElement?.contains(action)).toBe(false);
  });

  it('renders no action bar at all when it is given none', () => {
    // Mutant: the shell renders its own default actions when `actions` is
    // absent — which would put rename and delete on the "Untitled" column,
    // where there is no discipline to rename or delete.
    render(
      <DisciplineColumn name="Untitled" lessonCount={2}>
        <span>Unfiled lesson</span>
      </DisciplineColumn>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
