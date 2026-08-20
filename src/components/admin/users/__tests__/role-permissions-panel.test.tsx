// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RolePermissionsPanel } from '../role-permissions-panel';

const baseProps = {
  roles: ['admin'],
  granted: { admin: ['user:read', 'structure:update'] },
  onToggle: vi.fn(),
  isSaving: false,
  isLoading: false,
};

const ADMIN_LOCK_REASON =
  'Org Admin is an org-level role — granting this here would apply to every course. Assign someone to the course instead.';

function checkboxesIn(legend: string): HTMLInputElement[] {
  const fieldset = screen.getByText(legend).closest('fieldset');
  expect(fieldset).not.toBeNull();
  return fieldset
    ? Array.from(
        fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      )
    : [];
}

describe('RolePermissionsPanel', () => {
  it('disables course-scoped entity checkboxes FOR AN ORG-LEVEL ROLE, even when granted', () => {
    render(<RolePermissionsPanel {...baseProps} />);

    // `structure:update` is in `granted`, so scoping to the "Course
    // structure" fieldset and asserting every checkbox inside it is disabled
    // proves the disable applies regardless of checked state — not merely to
    // unchecked boxes.
    const structureCheckboxes = checkboxesIn('Course structure');
    expect(structureCheckboxes.length).toBeGreaterThan(0);
    for (const checkbox of structureCheckboxes) {
      expect(checkbox.disabled).toBe(true);
    }

    // The reason is real text content in the fieldset, reachable by AT via
    // aria-describedby — not conveyed by styling alone.
    expect(screen.getAllByText(ADMIN_LOCK_REASON).length).toBeGreaterThan(0);
    expect(
      structureCheckboxes[0]?.getAttribute('aria-describedby'),
    ).toBeTruthy();
  });

  it('disables staff and content entities too, for the same reason', () => {
    render(<RolePermissionsPanel {...baseProps} />);
    for (const legend of ['Course content', 'Course staff']) {
      const checkboxes = checkboxesIn(legend);
      expect(checkboxes.length).toBeGreaterThan(0);
      for (const checkbox of checkboxes) {
        expect(checkbox.disabled).toBe(true);
      }
    }
  });

  it('leaves the "user" entity tickable', () => {
    render(<RolePermissionsPanel {...baseProps} />);
    const userCheckboxes = checkboxesIn('People');
    expect(userCheckboxes.length).toBeGreaterThan(0);
    for (const checkbox of userCheckboxes) {
      expect(checkbox.disabled).toBe(false);
    }
  });

  /**
   * The lock is per (role, entity), not per entity.
   *
   * `requireCoursePermission` unions global and `course_staff` roles and hands
   * the NAMES to `getUserPermissions`, which reads `role_permissions` — so a
   * subject expert's `structure:*` and `content:*` live in exactly the rows
   * this grid edits. Disabling them for every role locked the only place they
   * can be repaired, under a caption that misdescribed where they come from.
   */
  it('lets an owner configure the course entities for a subject expert', () => {
    render(
      <RolePermissionsPanel
        {...baseProps}
        roles={['subject-expert']}
        granted={{ 'subject-expert': ['structure:update'] }}
      />,
    );

    for (const legend of [
      'Course structure',
      'Course content',
      'Course staff',
    ]) {
      const checkboxes = checkboxesIn(legend);
      expect(checkboxes.length).toBeGreaterThan(0);
      for (const checkbox of checkboxes) {
        expect(checkbox.disabled).toBe(false);
      }
    }
  });

  it('says nothing about org-level scope on a course-scoped role', () => {
    render(
      <RolePermissionsPanel
        {...baseProps}
        roles={['course-manager']}
        granted={{}}
      />,
    );

    expect(screen.queryByText(/is an org-level role/)).toBeNull();
  });

  it('reaches the onToggle consumer when a course entity is ticked for a course role', () => {
    const onToggle = vi.fn();
    render(
      <RolePermissionsPanel
        {...baseProps}
        roles={['course-manager']}
        granted={{}}
        onToggle={onToggle}
      />,
    );

    const first = checkboxesIn('Course structure')[0];
    expect(first).toBeDefined();
    first?.click();

    // The grid's whole purpose: the owner's tick has to reach the mutation.
    expect(onToggle).toHaveBeenCalledWith(
      'course-manager',
      'structure',
      'read',
      true,
    );
  });

  it('keeps the lock per role when both kinds are on screen at once', () => {
    render(
      <RolePermissionsPanel
        {...baseProps}
        roles={['admin', 'subject-expert']}
        granted={{}}
      />,
    );

    const [adminStructure, smeStructure] = screen
      .getAllByText('Course structure')
      .map((legend) => legend.closest('fieldset'));
    expect(
      adminStructure?.querySelector<HTMLInputElement>('input')?.disabled,
    ).toBe(true);
    expect(
      smeStructure?.querySelector<HTMLInputElement>('input')?.disabled,
    ).toBe(false);
  });
});
