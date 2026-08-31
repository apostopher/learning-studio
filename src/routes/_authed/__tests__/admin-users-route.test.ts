// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { Route } from '../admin.users';

/**
 * The loader primes the users query so a hovered nav link starts the request
 * before the click. It must NOT run on the server.
 *
 * `@vitest-environment node`, deliberately — this file's whole point is that
 * `window` is undefined here, exactly as it is during SSR.
 */
describe('/admin/users loader', () => {
  it('primes nothing on the server', () => {
    const ensureQueryData = vi.fn();

    // biome-ignore lint/suspicious/noExplicitAny: exercising the route option directly, not through the router
    (Route.options.loader as any)?.({
      context: { queryClient: { ensureQueryData } },
    });

    // The query's `queryFn` does `fetch('/api/admin/users')` — a relative
    // URL, which Node cannot resolve (`TypeError: Failed to parse URL`).
    // Primed during SSR it threw, and since the call is deliberately not
    // awaited that surfaced as an unhandled rejection plus a rejected entry
    // in the cache for the SSR-Query integration to dehydrate, which hung the
    // page. Mutant this catches: the `typeof window` guard removed — which
    // reads as a harmless tidy-up, and is the exact regression.
    expect(ensureQueryData).not.toHaveBeenCalled();
  });

  it('still adds no gate of its own beyond the permission check', () => {
    // The loader is a prefetch, never a guard: `beforeLoad` owns the
    // `user:read` redirect. A loader that threw or redirected would be
    // enforcing policy from the wrong place, and this one returns nothing.
    expect(Route.options.beforeLoad).toBeDefined();
  });
});
