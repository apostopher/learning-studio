// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPersona } from '#/lib/admin-schemas';
import { PersonaList } from '../persona-list';

const content = {
  basicInfo: '',
  mission: '',
  goal: '',
  communicationStyle: '',
  quotes: [],
  coreDirective: '',
  howToAnswer: '',
};

const persona: AdminPersona = {
  id: 7,
  name: 'Viper7',
  content,
  draftContent: null,
  isPublished: true,
  isOrgDefault: false,
  usedByCourses: [],
  updatedAt: '2026-11-19T00:00:00.000Z',
};

const baseProps = {
  personas: [persona],
  isLoading: false,
  onOpenEditor: vi.fn(),
  onToggleOrgDefault: vi.fn(),
  pendingDeleteId: null,
  onRequestDelete: vi.fn(),
  onConfirmDelete: vi.fn(),
  isDeleting: false,
  newName: '',
  onNewNameChange: vi.fn(),
  onCreate: vi.fn(),
  isCreating: false,
};

describe('PersonaList', () => {
  it('shows no course selection without a course', () => {
    const onToggleOrgDefault = vi.fn();
    const { container } = render(
      <PersonaList {...baseProps} onToggleOrgDefault={onToggleOrgDefault} />,
    );
    expect(screen.queryByLabelText(/use .* for/i)).toBeNull();
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(container.textContent).not.toMatch(/ in \./);
    fireEvent.click(screen.getByRole('button', { name: /make viper7/i }));
    expect(onToggleOrgDefault).toHaveBeenCalledWith(persona);
  });

  it('still selects for a course in the dialog', () => {
    const onSelectForCourse = vi.fn();
    render(
      <PersonaList
        {...baseProps}
        courseSelection={{
          courseName: 'ITPS',
          courseLinked: true,
          selectedPersonaId: null,
          onSelectForCourse,
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Use Viper7 for ITPS'));
    expect(onSelectForCourse).toHaveBeenCalledWith(7);
  });
});
