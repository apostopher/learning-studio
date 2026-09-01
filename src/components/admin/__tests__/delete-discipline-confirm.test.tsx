// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeleteDisciplineConfirm } from '../delete-discipline-confirm';

function renderConfirm(overrides: Partial<{ lessonCount: number }> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteDisciplineConfirm
      disciplineName="Aerobatics"
      lessonCount={overrides.lessonCount ?? 0}
      isPending={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('DeleteDisciplineConfirm', () => {
  it('names the discipline and lets an empty one be deleted', () => {
    const { onConfirm } = renderConfirm({ lessonCount: 0 });

    expect(screen.getByText('Aerobatics')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete discipline' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('refuses a discipline that still holds lessons, and says how many', () => {
    // Mutant: the `lessonCount > 0` branch dropped, so the button stays live
    // and the user is sent to a 409 the screen could have prevented — and the
    // count, which is the whole instruction, is never shown.
    const { onConfirm } = renderConfirm({ lessonCount: 3 });

    expect(
      screen.getByText(
        'Aerobatics still has 3 lessons. Move them to another discipline first, then delete it.',
      ),
    ).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Delete discipline' });
    fireEvent.click(button);
    // Mutant: `disabled` set but the handler still attached. `disabled`
    // blocks a click in the DOM, so this is belt-and-braces — but the
    // handler-guard is what makes it inert if the styling ever changes.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses the singular for exactly one lesson', () => {
    // Mutant: the noun hardcoded to "lessons", producing "1 lessons".
    renderConfirm({ lessonCount: 1 });
    expect(
      screen.getByText(
        'Aerobatics still has 1 lesson. Move them to another discipline first, then delete it.',
      ),
    ).toBeTruthy();
  });

  it('describes the blocked button with the reason, not just placing it nearby', () => {
    // Mutant: `aria-describedby` dropped. A screen-reader user who tabs
    // straight to the button then hears a dead control with no explanation —
    // the exact failure the house rule on locked states exists to prevent.
    renderConfirm({ lessonCount: 2 });

    const button = screen.getByRole('button', { name: 'Delete discipline' });
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBe('delete-discipline-reason');
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Aerobatics still has 2 lessons. Move them to another discipline first, then delete it.',
    );
  });

  it('leaves the button undescribed when nothing is blocking it', () => {
    // Mutant: `aria-describedby` always present, pointing at the ordinary
    // confirmation sentence — which would make every delete sound refused.
    renderConfirm({ lessonCount: 0 });

    expect(
      screen
        .getByRole('button', { name: 'Delete discipline' })
        .getAttribute('aria-describedby'),
    ).toBeNull();
  });
});
