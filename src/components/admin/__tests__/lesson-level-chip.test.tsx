// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonLevelChip } from '#/components/admin/lesson-level-chip';
import type { UserLevel } from '#/types';

function renderChip(value: UserLevel[], onValueChange = vi.fn()) {
  render(
    <LessonLevelChip
      value={value}
      onValueChange={onValueChange}
      lessonName="Radio failure"
    />,
  );
  return onValueChange;
}

describe('LessonLevelChip trigger', () => {
  it('still draws a chip when no level is set, because empty means everyone', () => {
    // Empty is a real state, not an absent one. The trigger has to stay
    // findable on the board when a lesson is untagged, so it renders a muted
    // placeholder rather than collapsing to nothing.
    renderChip([]);
    expect(screen.getByText('-')).toBeDefined();
  });

  it('names the empty state in words a screen reader can act on', () => {
    renderChip([]);
    expect(
      screen.getByRole('button', {
        name: /Levels for Radio failure: all levels/,
      }),
    ).toBeDefined();
  });

  it('shows the selected level as an initial, not the placeholder', () => {
    renderChip(['basic']);
    expect(screen.getByText('B')).toBeDefined();
    expect(screen.queryByText('-')).toBeNull();
  });

  it('orders initials by rung, not by however the array was stored', () => {
    renderChip(['advanced', 'basic']);
    const trigger = screen.getByRole('button');
    // B must precede E regardless of input order, so that two lessons tagged
    // with the same pair always read identically on the board.
    expect(trigger.textContent).toBe('B+E');
  });

  it('spells out full level names in the accessible name, not the acronyms', () => {
    renderChip(['intermediate']);
    // "INTER" is legible on screen but is not a word a screen reader user can act on.
    expect(
      screen.getByRole('button', {
        name: /Levels for Radio failure: Intermediate/,
      }),
    ).toBeDefined();
  });
});

describe('LessonLevelChip picker', () => {
  it('adds a level to the set rather than replacing it', async () => {
    const user = userEvent.setup();
    const onValueChange = renderChip(['basic']);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Advanced' }));

    expect(onValueChange).toHaveBeenCalledWith(['basic', 'advanced']);
  });

  it('removes a level when its toggle is pressed again', async () => {
    const user = userEvent.setup();
    const onValueChange = renderChip(['basic', 'advanced']);

    await user.click(screen.getByRole('button', { name: /Levels for/ }));
    await user.click(screen.getByRole('button', { name: 'Basic' }));

    expect(onValueChange).toHaveBeenCalledWith(['advanced']);
  });

  it('gives the picker a name of its own, now that the heading is gone', async () => {
    // Three uppercase acronyms in a box say nothing by themselves; the group
    // is what tells a screen-reader user what it is choosing between.
    const user = userEvent.setup();
    renderChip([]);

    await user.click(screen.getByRole('button', { name: /Levels for/ }));

    expect(
      screen.getByRole('group', { name: 'Levels that see this lesson' }),
    ).toBeDefined();
  });
});
