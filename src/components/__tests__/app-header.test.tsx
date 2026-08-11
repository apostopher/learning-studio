// @vitest-environment jsdom
import { Tooltip } from '@base-ui/react/tooltip';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../app-header';

/**
 * The real Logo reads `src/styles/theme.generated`, which is gitignored and
 * produced at build time. Stubbing both keeps this test about the header's
 * wiring rather than about whether the theme happens to have been generated.
 */
vi.mock('../logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <span data-testid="logo" className={className} />
  ),
}));

vi.mock('../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

/**
 * The header now contains a router `Link`, so it cannot render bare. `/app`
 * must exist in the stand-in tree for `to="/app"` to resolve.
 */
const renderHeader = async (props: {
  onSignOut: () => void;
  isSigningOut: boolean;
}) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => (
      <Tooltip.Provider delay={0}>
        <AppHeader {...props} />
      </Tooltip.Provider>
    ),
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/app'] }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one
  render(<RouterProvider router={router as any} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Sign(ing)? out/ })).toBeDefined(),
  );
};

describe('AppHeader', () => {
  it('renders the logo as a link home', async () => {
    await renderHeader({ onSignOut: vi.fn(), isSigningOut: false });

    expect(screen.getByRole('link').getAttribute('href')).toBe('/app');
  });

  /**
   * Asserts on the collaborator the header was handed, not on any internal
   * state: if the button ever stops being wired to the prop, this goes red.
   */
  it('calls onSignOut when the sign-out button is pressed', async () => {
    const onSignOut = vi.fn();
    await renderHeader({ onSignOut, isSigningOut: false });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('announces the pending state through the accessible name', async () => {
    await renderHeader({ onSignOut: vi.fn(), isSigningOut: true });

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
  it('cannot be fired again while a sign-out is already in flight', async () => {
    const onSignOut = vi.fn();
    await renderHeader({ onSignOut, isSigningOut: true });

    const button = screen.getByRole('button', { name: 'Signing out…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
