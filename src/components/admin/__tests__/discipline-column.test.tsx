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
});
