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

describe('RolePermissionsPanel', () => {
  it('disables course-scoped entity checkboxes and states why, even when granted', () => {
    render(<RolePermissionsPanel {...baseProps} />);

    // `structure:update` is in `granted`, so scoping to the "Course
    // structure" fieldset and asserting every checkbox inside it is disabled
    // proves the disable applies regardless of checked state — not merely to
    // unchecked boxes.
    const structureFieldset = screen
      .getByText('Course structure')
      .closest('fieldset');
    expect(structureFieldset).not.toBeNull();
    const structureCheckboxes = structureFieldset
      ? Array.from(structureFieldset.querySelectorAll('input[type="checkbox"]'))
      : [];
    expect(structureCheckboxes.length).toBeGreaterThan(0);
    for (const checkbox of structureCheckboxes) {
      expect((checkbox as HTMLInputElement).disabled).toBe(true);
    }

    // The reason is real text content in the fieldset, reachable by AT via
    // aria-describedby — not conveyed by styling alone.
    expect(
      screen.getAllByText(
        'Granted by assigning someone to a course, not by this grid.',
      ).length,
    ).toBeGreaterThan(0);
    const firstStructureCheckbox = structureCheckboxes[0] as
      | HTMLInputElement
      | undefined;
    expect(
      firstStructureCheckbox?.getAttribute('aria-describedby'),
    ).toBeTruthy();
  });

  it('disables staff and content entities too, for the reason', () => {
    render(<RolePermissionsPanel {...baseProps} />);
    for (const legend of ['Course content', 'Course staff']) {
      const fieldset = screen.getByText(legend).closest('fieldset');
      expect(fieldset).not.toBeNull();
      const checkboxes = fieldset
        ? Array.from(fieldset.querySelectorAll('input[type="checkbox"]'))
        : [];
      expect(checkboxes.length).toBeGreaterThan(0);
      for (const checkbox of checkboxes) {
        expect((checkbox as HTMLInputElement).disabled).toBe(true);
      }
    }
  });

  it('leaves the "user" entity tickable', () => {
    render(<RolePermissionsPanel {...baseProps} />);
    const userFieldset = screen.getByText('People').closest('fieldset');
    expect(userFieldset).not.toBeNull();
    const userCheckboxes = userFieldset
      ? Array.from(userFieldset.querySelectorAll('input[type="checkbox"]'))
      : [];
    expect(userCheckboxes.length).toBeGreaterThan(0);
    for (const checkbox of userCheckboxes) {
      expect((checkbox as HTMLInputElement).disabled).toBe(false);
    }
  });
});
