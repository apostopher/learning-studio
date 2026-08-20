// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));
vi.mock('../create-module-dialog-container', () => ({
  CreateModuleDialogContainer: () => <button type="button">Add module</button>,
}));
vi.mock('../course-staff-container', () => ({
  CourseStaffContainer: () => <button type="button">Course staff</button>,
}));
vi.mock('../course-embeddings-dialog-container', () => ({
  CourseEmbeddingsDialogContainer: () => <div data-testid="embeddings" />,
}));
vi.mock('../edit-course-dialog-container', () => ({
  EditCourseDialogContainer: () => <div data-testid="edit-dialog" />,
}));
vi.mock('../delete-course-dialog-container', () => ({
  DeleteCourseDialogContainer: () => <div data-testid="delete-dialog" />,
}));

import {
  CourseActionsContainer,
  type CourseToolbarCapabilities,
} from '../course-actions-container';

const COURSE = {
  id: 7,
  name: 'Private Pilot',
  slug: 'ppl',
  description: null,
  imageUrlAvif: null,
  imageUrlWebp: null,
};

const ALL: CourseToolbarCapabilities = {
  canEditCourse: true,
  canDeleteCourse: true,
  canTrainCourse: true,
};

/** What a subject expert actually holds: no org-level grant at all. */
const NONE: CourseToolbarCapabilities = {
  canEditCourse: false,
  canDeleteCourse: false,
  canTrainCourse: false,
};

function renderToolbar(capabilities: CourseToolbarCapabilities) {
  render(
    <Provider store={createStore()}>
      <CourseActionsContainer course={COURSE} capabilities={capabilities} />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CourseActionsContainer', () => {
  it('shows every control to an admin who holds them all', () => {
    renderToolbar(ALL);

    expect(screen.getByRole('button', { name: 'AI training' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit course' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete course' })).toBeTruthy();
  });

  /**
   * This task sends subject experts into this editor by design, and all three
   * of these are guarded org-level with no course-scoped fallback — every one
   * of them would 403 on click.
   */
  it('hides the org-level controls from a subject expert', () => {
    renderToolbar(NONE);

    expect(screen.queryByRole('button', { name: 'AI training' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit course' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete course' })).toBeNull();
  });

  /**
   * The dialogs are siblings of their triggers, not children — leaving them
   * mounted would keep the whole edit/delete/training machinery alive for
   * someone with no way, and no right, to open it.
   */
  it('mounts no dialog it cannot open', () => {
    renderToolbar(NONE);

    expect(screen.queryByTestId('embeddings')).toBeNull();
    expect(screen.queryByTestId('edit-dialog')).toBeNull();
    expect(screen.queryByTestId('delete-dialog')).toBeNull();
  });

  /**
   * Modules and staff are COURSE-scoped, which is exactly what staff hold. If
   * gating ever swept these up, the editor a professor was hired to work in
   * would have nothing in it.
   */
  it('keeps the course-scoped controls for everyone who reaches the board', () => {
    renderToolbar(NONE);

    expect(screen.getByRole('button', { name: 'Add module' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Course staff' })).toBeTruthy();
  });

  it('gates each control on its own grant', () => {
    renderToolbar({ ...NONE, canEditCourse: true });

    expect(screen.getByRole('button', { name: 'Edit course' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete course' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI training' })).toBeNull();
  });
});
