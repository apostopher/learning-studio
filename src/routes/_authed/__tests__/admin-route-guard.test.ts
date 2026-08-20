// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// The shell renders the app header, which reaches the whole component graph.
// Only `beforeLoad` is under test here, so the component is stubbed away.
vi.mock('#/components/admin/admin-shell-layout', () => ({
  AdminShellLayout: () => null,
}));

import { Route } from '../admin';

type Ctx = { roles: string[]; isStaffAnywhere: boolean };

/**
 * Runs the real route guard and reports where it sent the actor.
 *
 * `beforeLoad` signals a redirect by throwing, so "allowed" is the absence of
 * a throw — asserting on a returned value would pass even if the guard stopped
 * being wired to the route.
 */
function enter(context: Ctx): 'allowed' | string {
  const beforeLoad = Route.options.beforeLoad;
  if (typeof beforeLoad !== 'function') {
    throw new Error('/admin has no beforeLoad — the gate is not wired at all');
  }
  try {
    // biome-ignore lint/suspicious/noExplicitAny: only `context` is read by this guard
    beforeLoad({ context } as any);
    return 'allowed';
  } catch (thrown) {
    const to = (thrown as { to?: string; options?: { to?: string } }).to;
    return (
      to ?? (thrown as { options?: { to?: string } }).options?.to ?? 'threw'
    );
  }
}

describe('/admin route guard', () => {
  it('admits a global admin', () => {
    expect(enter({ roles: ['admin'], isStaffAnywhere: false })).toBe('allowed');
  });

  it('admits an owner', () => {
    expect(enter({ roles: ['owner'], isStaffAnywhere: false })).toBe('allowed');
  });

  /**
   * The whole point of Task 14. A subject expert holds no global role at all,
   * so an admin-only floor redirected them away from the course editor they
   * were hired to author in and from the staff panel built for them — both are
   * children of this route.
   */
  it('admits course staff who hold no global role', () => {
    expect(enter({ roles: [], isStaffAnywhere: true })).toBe('allowed');
  });

  it('redirects a learner who is neither admin nor staff to /app', () => {
    expect(enter({ roles: [], isStaffAnywhere: false })).toBe('/app');
  });

  it('redirects someone whose only role is unrelated', () => {
    expect(enter({ roles: ['associate'], isStaffAnywhere: false })).toBe(
      '/app',
    );
  });
});
