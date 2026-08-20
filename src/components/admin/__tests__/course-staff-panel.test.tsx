// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CourseStaffMember } from '#/db/course-staff';
import { CourseStaffPanel } from '../course-staff-panel';

const staff: CourseStaffMember[] = [
  {
    userId: 'u1',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    roles: ['subject-expert'],
  },
];

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  courseName: 'Drone Basics',
  isLoading: false,
  assignableRoles: ['subject-expert', 'course-manager'],
  canAssign: true,
  people: [{ userId: 'u2', label: 'Sam Lee (sam@example.com)' }],
  selectedUserId: null,
  onSelectedUserIdChange: vi.fn(),
  selectedRole: null,
  onSelectedRoleChange: vi.fn(),
  onAssign: vi.fn(),
  onRemove: vi.fn(),
  isSaving: false,
};

describe('CourseStaffPanel', () => {
  it('shows the role acronym as visible text, with the full role name as the accessible name of the remove control', () => {
    render(<CourseStaffPanel {...baseProps} staff={staff} />);

    // Visible badge text is the short acronym, not the full name.
    expect(screen.getByText('SME')).toBeTruthy();
    expect(screen.queryByText('Subject Expert')).toBeNull();

    // The accessible name on the actionable control carries the full name —
    // "SME" alone isn't a label a screen reader user can act on.
    expect(
      screen.getByRole('button', {
        name: 'Remove Subject Expert from Jane Doe',
      }),
    ).toBeTruthy();
  });

  it('shows "No staff assigned yet." when the roster is empty', () => {
    render(<CourseStaffPanel {...baseProps} staff={[]} />);
    expect(screen.getByText('No staff assigned yet.')).toBeTruthy();
  });

  it('hides the assign form when the actor cannot assign', () => {
    render(<CourseStaffPanel {...baseProps} staff={staff} canAssign={false} />);
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('labels the person picker for assistive tech', () => {
    render(<CourseStaffPanel {...baseProps} staff={staff} />);
    expect(
      screen.getByRole('combobox', { name: 'Person to assign' }),
    ).toBeTruthy();
  });
});
