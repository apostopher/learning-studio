// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SetLevelDialog } from '../set-level-dialog';

const register = (name: string) => ({
  name,
  onChange: async () => {},
  onBlur: async () => {},
  ref: () => {},
});

const renderDialog = (isPending: boolean, onOpenChange = vi.fn()) => {
  render(
    <SetLevelDialog
      open
      onOpenChange={onOpenChange}
      courseName="Instrument Ground School"
      level="advanced"
      onSubmit={(e) => e.preventDefault()}
      registerMessage={register('message')}
      registerNote={register('note')}
      isPending={isPending}
    />,
  );
  return onOpenChange;
};

const isDisabled = (el: HTMLElement) =>
  el.hasAttribute('disabled') || el.hasAttribute('data-disabled');

describe('SetLevelDialog while saving', () => {
  it('locks Cancel and Close, and says why', () => {
    renderDialog(true);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(isDisabled(cancel)).toBe(true);
    expect(isDisabled(close)).toBe(true);
    const why = screen.getByText(/Saving…/);
    expect(cancel.getAttribute('aria-describedby')).toBe(why.id);
    expect(close.getAttribute('aria-describedby')).toBe(why.id);
  });

  it('does not close on Escape mid-save', () => {
    const onOpenChange = renderDialog(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange.mock.calls.map((call) => call[0])).not.toContain(false);
  });

  it('closes on Escape when nothing is saving (so the test above can fail)', () => {
    const onOpenChange = renderDialog(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange.mock.calls.map((call) => call[0])).toContain(false);
  });

  it('lets Cancel close it when nothing is saving', () => {
    const onOpenChange = renderDialog(false);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(isDisabled(cancel)).toBe(false);
    fireEvent.click(cancel);
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});
