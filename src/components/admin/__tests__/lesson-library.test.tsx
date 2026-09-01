// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LessonLibrary } from '../lesson-library';

describe('LessonLibrary', () => {
  it('renders its children and its header action', () => {
    // Mutant: `headerAction` is accepted but never rendered. This fails
    // against that mutant because the action would not be in the document.
    render(
      <LessonLibrary
        headerAction={<button type="button">Add discipline</button>}
      >
        <div>Aerobatics column</div>
      </LessonLibrary>,
    );
    expect(screen.getByText('Aerobatics column')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add discipline' })).toBeTruthy();
  });

  it('renders no action at all when it is given none', () => {
    // Mutant: the shell supplies a default create button when none is passed,
    // putting the admin-only action in front of a discipline SME — who the
    // server would then refuse with a 403 they never asked for.
    render(
      <LessonLibrary>
        <div>Aerobatics column</div>
      </LessonLibrary>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the action in the header, not adrift among the columns', () => {
    // Mutant: `headerAction` rendered inside the scrolling column area, where
    // it would scroll away with the columns. Presence alone cannot see this.
    render(
      <LessonLibrary
        headerAction={<button type="button">Add discipline</button>}
      >
        <div>Aerobatics column</div>
      </LessonLibrary>,
    );
    const action = screen.getByRole('button', { name: 'Add discipline' });
    expect(action.closest('header')).not.toBeNull();
  });
});
