// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoLink } from '../logo-link';

/**
 * `theme.generated` is gitignored and produced at build time, so a test that
 * imports it for real passes or fails on whether the theme happens to have
 * been generated. Same reasoning as the `../logo` stub in app-header.test.tsx.
 */
vi.mock('../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

/** A stand-in route tree: `/app` must exist for `to="/app"` to resolve. */
async function renderLogoLink() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const elsewhereRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => <LogoLink />,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, elsewhereRoute]),
    history: createMemoryHistory({ initialEntries: ['/admin'] }),
  });

  // biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one
  render(<RouterProvider router={router as any} />);
  await waitFor(() => expect(screen.getByRole('link')).toBeDefined());
}

describe('LogoLink', () => {
  it('points home to /app', async () => {
    await renderLogoLink();

    expect(screen.getByRole('link').getAttribute('href')).toBe('/app');
  });

  /**
   * `Logo` carries its own `role="img"` + `aria-label`. Nested inside a link
   * that also has a label, a screen reader announces the name twice. Asserting
   * no `img` role survives is what proves the wrapper actually hid it — a
   * version that drops `aria-hidden` still renders and still links, and only
   * this assertion goes red.
   */
  it('exposes exactly one accessible name, the link’s', async () => {
    await renderLogoLink();

    expect(
      screen.getByRole('link', { name: 'Test Academy, home' }),
    ).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
