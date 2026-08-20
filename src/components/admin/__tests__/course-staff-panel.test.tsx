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
  removableRoles: ['subject-expert', 'course-manager'],
  people: [{ userId: 'u2', label: 'Sam Lee (sam@example.com)' }],
  peopleQuery: '',
  onPeopleQueryChange: vi.fn(),
  peopleEmptyLabel: 'Type at least 2 characters to search',
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

  /**
   * A hidden control still owes the reader a reason. `staff:read` and
   * `staff:create` are independently grantable, so "you can look but not
   * touch" is a real state — and it used to render a live assign form and a
   * live Remove button that both 403'd.
   */
  it('says why the assign form is missing', () => {
    render(<CourseStaffPanel {...baseProps} staff={staff} canAssign={false} />);

    expect(
      screen.getByText(
        'You can remove staff from this course but not add anyone. Ask an admin for permission to assign staff here.',
      ),
    ).toBeTruthy();
  });

  it('hides the Remove control, and says why, when the actor cannot remove', () => {
    render(
      <CourseStaffPanel {...baseProps} staff={staff} removableRoles={[]} />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'Remove Subject Expert from Jane Doe',
      }),
    ).toBeNull();
    expect(
      screen.getByText(
        'You can add staff to this course but not remove anyone. Ask an admin for permission to remove staff here.',
      ),
    ).toBeTruthy();
  });

  /**
   * Losing the remove button must not lose the role's name with it — the
   * button's accessible name was the only thing spelling out "SME".
   */
  it('keeps the full role name reachable once the button is gone', () => {
    render(
      <CourseStaffPanel {...baseProps} staff={staff} removableRoles={[]} />,
    );

    expect(screen.getByText('SME')).toBeTruthy();
    expect(screen.getByText('Subject Expert')).toBeTruthy();
  });

  it('explains a wholly read-only roster in one sentence', () => {
    render(
      <CourseStaffPanel
        {...baseProps}
        staff={staff}
        canAssign={false}
        removableRoles={[]}
      />,
    );

    expect(
      screen.getByText(
        'You can see the staff for this course but not change it. Ask an admin for permission to assign and remove staff here.',
      ),
    ).toBeTruthy();
  });

  it('says nothing extra when the actor can do everything', () => {
    render(<CourseStaffPanel {...baseProps} staff={staff} />);

    expect(screen.queryByText(/Ask an admin for permission/)).toBeNull();
    expect(screen.queryByText(/Only an admin or owner can remove/)).toBeNull();
  });

  /**
   * Round 2. Removal is railed by role, so a subject expert sees a Remove
   * control on their assistant and none on a fellow professor. A live control
   * that 403s is what this task has been sweeping; the mixed list is also a
   * genuinely puzzling absence, so it earns a sentence.
   */
  it('offers no Remove on a role this actor may not take away', () => {
    render(
      <CourseStaffPanel
        {...baseProps}
        staff={staff}
        removableRoles={['course-manager']}
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'Remove Subject Expert from Jane Doe',
      }),
    ).toBeNull();
    expect(
      screen.getByText(
        'Only an admin or owner can remove a Subject Expert from this course.',
      ),
    ).toBeTruthy();
  });

  it('keeps Remove on the roles it may take away', () => {
    const mixed = [
      ...staff,
      {
        userId: 'u2',
        email: 'sam@example.com',
        firstName: 'Sam',
        lastName: 'Lee',
        roles: ['course-manager'],
      },
    ];

    render(
      <CourseStaffPanel
        {...baseProps}
        staff={mixed}
        removableRoles={['course-manager']}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Remove Course Manager from Sam Lee',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Remove Subject Expert from Jane Doe',
      }),
    ).toBeNull();
  });

  /** A rule about a role nobody on this roster holds is a rule about nothing. */
  it('stays quiet about a locked role that is not on the roster', () => {
    const onlyManagers = [
      {
        userId: 'u2',
        email: 'sam@example.com',
        firstName: 'Sam',
        lastName: 'Lee',
        roles: ['course-manager'],
      },
    ];

    render(
      <CourseStaffPanel
        {...baseProps}
        staff={onlyManagers}
        removableRoles={['course-manager']}
      />,
    );

    expect(screen.queryByText(/Only an admin or owner can remove/)).toBeNull();
  });
});
