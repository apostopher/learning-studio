// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCourse } from '#/lib/admin-schemas';

vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

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

import { CourseColumn } from '../course-column';

function course(overrides: Partial<BoardCourse> = {}): BoardCourse {
  return {
    id: 1,
    name: '2 Week Intensive',
    slug: '2-week',
    description: null,
    imageUrlAvif: null,
    imageUrlWebp: null,
    ...overrides,
  };
}

describe('CourseColumn', () => {
  it('renders the course name and its children', () => {
    // Mutant: `children` is dropped from the JSX (the Accordion.Root
    // renders empty). This assertion fails against that mutant because the
    // module text passed in as a child would never be found.
    render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );
    expect(screen.getByText('2 Week Intensive')).toBeTruthy();
    expect(screen.getByText('Module One')).toBeTruthy();
  });

  it('renders no action bar at all when it is given none', () => {
    // The header's own edit pencil is gone: course actions live in the
    // subheader now, and they are the caller's to supply. Mutant this
    // catches: the shell rendering its own default actions, which would put
    // edit and delete in front of an actor the caller deliberately withheld
    // them from.
    render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts its actions in the subheader, not adrift among the modules', () => {
    // Mutant: `actions` rendered inside the ScrollArea alongside the module
    // accordion, where they would scroll away with it. Asserting only that
    // the action is somewhere in the document cannot see this.
    render(
      <CourseColumn
        course={course()}
        actions={<button type="button">Delete 2 Week Intensive</button>}
      >
        <div data-testid="module">Module One</div>
      </CourseColumn>,
    );
    const action = screen.getByRole('button', {
      name: 'Delete 2 Week Intensive',
    });
    const module_ = screen.getByTestId('module');
    expect(module_.parentElement?.contains(action)).toBe(false);
  });
});
