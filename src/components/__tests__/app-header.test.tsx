// @vitest-environment jsdom
import { Tooltip } from '@base-ui/react/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../app-header';

/**
 * The real Logo reads `src/styles/theme.generated`, which is gitignored and
 * produced at build time. Stubbing it keeps this test about the header's
 * wiring rather than about whether the theme happens to have been generated.
 */
vi.mock('../logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <span data-testid="logo" className={className} />
  ),
}));

const renderHeader = (props: {
  onSignOut: () => void;
  isSigningOut: boolean;
}) =>
  render(
    <Tooltip.Provider delay={0}>
      <AppHeader {...props} />
    </Tooltip.Provider>,
  );

describe('AppHeader', () => {
  it('renders the logo slot', () => {
    renderHeader({ onSignOut: vi.fn(), isSigningOut: false });
    expect(screen.getByTestId('logo')).toBeTruthy();
  });

  /**
   * Asserts on the collaborator the header was handed, not on any internal
   * state: if the button ever stops being wired to the prop, this goes red.
   */
  it('calls onSignOut when the sign-out button is pressed', () => {
    const onSignOut = vi.fn();
    renderHeader({ onSignOut, isSigningOut: false });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('announces the pending state through the accessible name', () => {
    renderHeader({ onSignOut: vi.fn(), isSigningOut: true });

    // The label is the accessible name, so a screen reader hears the state
    // change rather than only sighted users seeing the dimmed button.
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  /**
   * Regression: Base UI's Tooltip.Trigger swallows the native `disabled`
   * attribute (it renders `data-trigger-disabled` and stays interactive), so
   * an implementation that only passes `disabled` leaves the button fully
   * clickable and fires a second sign-out. Assert the behaviour — that the
   * handler does not run — not the attribute.
   */
  it('cannot be fired again while a sign-out is already in flight', () => {
    const onSignOut = vi.fn();
    renderHeader({ onSignOut, isSigningOut: true });

    const button = screen.getByRole('button', { name: 'Signing out…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
