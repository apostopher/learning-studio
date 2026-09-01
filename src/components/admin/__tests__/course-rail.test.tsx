// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CourseRail } from '../course-rail';

describe('CourseRail', () => {
  it('renders its children and its header action', () => {
    // Mutant: `headerAction` is accepted but never rendered (the header holds
    // only its heading). This fails against that mutant because the action
    // would not be in the document at all.
    render(
      <CourseRail headerAction={<button type="button">New offering</button>}>
        <div>2 Week course column</div>
      </CourseRail>,
    );
    expect(screen.getByText('2 Week course column')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New offering' })).toBeTruthy();
  });

  it('renders no action at all when it is given none', () => {
    // Mutant: the shell supplies its own default button when `headerAction`
    // is absent — which would put a create control in front of someone the
    // caller deliberately withheld it from.
    render(
      <CourseRail>
        <div>2 Week course column</div>
      </CourseRail>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the action in the header, not adrift among the columns', () => {
    // Mutant: `headerAction` rendered inside the scrolling column area
    // instead of the header — visually wrong, and it would scroll away with
    // the columns. Asserting on presence alone cannot see this.
    render(
      <CourseRail headerAction={<button type="button">New offering</button>}>
        <div>2 Week course column</div>
      </CourseRail>,
    );
    const action = screen.getByRole('button', { name: 'New offering' });
    expect(action.closest('header')).not.toBeNull();
  });
});
