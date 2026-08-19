// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromotionInterstitial } from '../promotion-interstitial';

describe('PromotionInterstitial', () => {
  it('is not open when there is no pending promotion', () => {
    render(<PromotionInterstitial promotion={null} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces the new level as the accessible title', () => {
    render(
      <PromotionInterstitial
        promotion={{ from: 'basic', to: 'intermediate' }}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: "You're now Intermediate" }),
    ).toBeTruthy();
  });

  /**
   * Asserts on the collaborator the button was handed, not on internal
   * state — if the button ever stops being wired to `onDismiss`, this goes
   * red (see CLAUDE.md's testing rule on asserting what the consumer got).
   */
  it('fires onDismiss when the CTA is pressed', () => {
    const onDismiss = vi.fn();
    render(
      <PromotionInterstitial
        promotion={{ from: 'basic', to: 'intermediate' }}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "See what's new" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /**
   * Base UI's Dialog also calls `onOpenChange(false)` for Escape / outside
   * click / any other close path — `onDismiss` has to be wired through that
   * callback too, not just the CTA's own `onClick`, or those paths would
   * leave the atom set and the dialog would reopen on the next render.
   */
  it('fires onDismiss when the dialog is closed via onOpenChange', () => {
    const onDismiss = vi.fn();
    render(
      <PromotionInterstitial
        promotion={{ from: 'basic', to: 'intermediate' }}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
