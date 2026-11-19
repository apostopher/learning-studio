// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RolePermissionsPanel } from '../role-permissions-panel';
import {
  buildRoleSections,
  buildRoleSummaries,
} from '../role-permissions-view';

// Base UI Tabs uses hooks; without the CJS shim vitest loads two Reacts and
// the hook dispatcher is null for src components.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const ROLES = ['admin', 'course-manager', 'subject-expert'];

function renderPanel(
  selectedRole: string,
  granted: Record<string, string[]> = {},
  overrides: Partial<Parameters<typeof RolePermissionsPanel>[0]> = {},
) {
  const onToggle = vi.fn();
  const onSelectRole = vi.fn();
  render(
    <RolePermissionsPanel
      roles={buildRoleSummaries(ROLES, granted)}
      selectedRole={selectedRole}
      sections={buildRoleSections(selectedRole, granted)}
      onSelectRole={onSelectRole}
      onToggle={onToggle}
      isSaving={false}
      isLoading={false}
      {...overrides}
    />,
  );
  return { onToggle, onSelectRole };
}

const checkbox = (name: string) =>
  screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('RolePermissionsPanel', () => {
  it('reaches onToggle with the SELECTED role when a box is ticked', () => {
    const { onToggle } = renderPanel('course-manager');
    fireEvent.click(checkbox('Add course structure'));
    expect(onToggle).toHaveBeenCalledWith(
      'course-manager',
      'structure',
      'create',
      true,
    );
  });

  it('reaches onToggle with false when a granted box is unticked', () => {
    const { onToggle } = renderPanel('subject-expert', {
      'subject-expert': ['content:update'],
    });
    const box = checkbox('Edit lesson content');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith(
      'subject-expert',
      'content',
      'update',
      false,
    );
  });

  it('asks the container to switch role when another role is picked', () => {
    const { onSelectRole } = renderPanel('admin');
    fireEvent.click(screen.getByRole('tab', { name: /Subject Expert/ }));
    expect(onSelectRole).toHaveBeenCalledWith('subject-expert');
  });

  it('shows role names, not stored names, with held counts', () => {
    renderPanel('admin', { admin: ['user:read'] });
    const tab = screen.getByRole('tab', { name: /Org Admin/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toMatch(/9 of 23/);
  });

  it('replaces the bypassed admin rows with one true sentence and no boxes', () => {
    renderPanel('admin');
    expect(
      screen.queryByRole('checkbox', { name: 'Edit course structure' }),
    ).toBeNull();
    expect(
      screen.getAllByText(/can always do this, on every course and discipline/)
        .length,
    ).toBe(2);
  });

  it('locks admin staff, says why visibly, and links the reason to the box', () => {
    renderPanel('admin', { admin: ['staff:read'] });
    const box = checkbox('See course staff');
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    const reasonId = box.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId ?? '')?.textContent).toMatch(
      /org-level role.*Assign someone on the course/,
    );
  });

  it('leaves every course area tickable for a subject expert', () => {
    renderPanel('subject-expert');
    for (const name of [
      'Add course structure',
      'Edit lesson content',
      'Remove course staff',
    ]) {
      expect(checkbox(name).disabled).toBe(false);
    }
    expect(screen.queryByText(/org-level role/)).toBeNull();
  });

  it('disables every box while a save is in flight', () => {
    renderPanel('course-manager', {}, { isSaving: true });
    expect(checkbox('See people').disabled).toBe(true);
    expect(screen.getByText('Saving…')).toBeTruthy();
  });
});
