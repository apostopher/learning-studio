// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutOfTierNotice } from '../out-of-tier-notice';

describe('OutOfTierNotice', () => {
  it('is not open when there is no notice', () => {
    render(<OutOfTierNotice notice={null} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the pilot’s current level in the description', () => {
    render(
      <OutOfTierNotice
        notice={{ level: 'intermediate' }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Intermediate/)).toBeTruthy();
  });

  /**
   * Asserts on the collaborator the button was handed, not on internal
   * state — see CLAUDE.md's testing rule on asserting what the consumer got.
   */
  it('fires onDismiss when the CTA is pressed', () => {
    const onDismiss = vi.fn();
    render(
      <OutOfTierNotice notice={{ level: 'basic' }} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /**
   * Base UI's Dialog also calls `onOpenChange(false)` for Escape / outside
   * click / any other close path — `onDismiss` has to be wired through that
   * callback too, not just the CTA's own `onClick`.
   */
  it('fires onDismiss when the dialog is closed via onOpenChange', () => {
    const onDismiss = vi.fn();
    render(
      <OutOfTierNotice notice={{ level: 'basic' }} onDismiss={onDismiss} />,
    );

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
