// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteDisciplineModuleConfirm } from '../delete-discipline-module-confirm';

describe('DeleteDisciplineModuleConfirm', () => {
  it('names how many lessons return to Untitled and that nothing is deleted', () => {
    const onConfirm = vi.fn();
    render(
      <DeleteDisciplineModuleConfirm
        moduleName="Basics"
        lessonCount={2}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/2 lessons in Basics return to Untitled/),
    ).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete module' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('uses the singular for one lesson', () => {
    render(
      <DeleteDisciplineModuleConfirm
        moduleName="Basics"
        lessonCount={1}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/1 lesson in Basics returns to Untitled/),
    ).toBeTruthy();
  });
});
