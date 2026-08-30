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

  it('shows the edit action only when onEditCourse is supplied', () => {
    // Mutant: the edit button is rendered unconditionally, ignoring whether
    // `onEditCourse` was passed. This assertion fails against that mutant
    // because `queryByLabelText('Edit course')` would then resolve.
    render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );
    expect(screen.queryByLabelText('Edit course')).toBeNull();
  });
});
