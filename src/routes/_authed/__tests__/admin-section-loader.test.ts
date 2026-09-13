// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { Route } from '../admin.index';

/**
 * The loader primes the users query so a hovered People link starts the
 * request before the click. It must NOT run on the server, and must not run
 * for the three sections that never read it.
 *
 * `@vitest-environment node`, deliberately — this file's whole point is that
 * `window` is undefined here, exactly as it is during SSR.
 */
function prime(section: string) {
  const ensureQueryData = vi.fn();
  // biome-ignore lint/suspicious/noExplicitAny: exercising the route option directly, not through the router
  (Route.options.loader as any)?.({
    context: { queryClient: { ensureQueryData } },
    deps: { section },
  });
  return ensureQueryData;
}

describe('/admin section loader', () => {
  it('primes nothing on the server', () => {
    // The query's `queryFn` does `fetch('/api/admin/users')` — a relative
    // URL, which Node cannot resolve (`TypeError: Failed to parse URL`).
    // Primed during SSR it threw, and since the call is deliberately not
    // awaited that surfaced as an unhandled rejection plus a rejected entry
    // in the cache for the SSR-Query integration to dehydrate, which hung the
    // page. Mutant this catches: the `typeof window` guard removed — which
    // reads as a harmless tidy-up, and is the exact regression.
    expect(prime('people')).not.toHaveBeenCalled();
  });

  /**
   * Now that every section shares one route, the loader runs on every section
   * change — so it has to say which section it is for. Without the check, the
   * users request would fire when someone opened the schedule.
   *
   * (In the browser. This assertion holds here for the SSR reason above too,
   * which is why the section check is pinned by the `deps` it was given rather
   * than by the call count alone.)
   */
  it('takes the section from its deps, not from nothing', () => {
    const loaderDeps = Route.options.loaderDeps;
    if (typeof loaderDeps !== 'function') {
      throw new Error(
        'the section screen has no loaderDeps — the loader can never re-run',
      );
    }
    // biome-ignore lint/suspicious/noExplicitAny: exercising the route option directly
    expect((loaderDeps as any)({ search: { section: 'people' } })).toEqual({
      section: 'people',
    });
    // A bare `/admin` is the default section, and the loader must see the same
    // value the screen renders.
    // biome-ignore lint/suspicious/noExplicitAny: exercising the route option directly
    expect((loaderDeps as any)({ search: {} })).toEqual({
      section: 'knowledge-library',
    });
  });

  it('is a prefetch, never a guard', () => {
    // The section gate owns the redirect. A loader that threw or redirected
    // would be enforcing policy from the wrong place, and this one returns
    // nothing.
    expect(Route.options.beforeLoad).toBeDefined();
    expect(prime('schedule')).not.toHaveBeenCalled();
  });
});
