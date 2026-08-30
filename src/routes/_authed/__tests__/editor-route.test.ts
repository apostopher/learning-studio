// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// The org editor's component reaches dnd-kit, Base UI and the whole admin
// component graph. Only the two `beforeLoad` guards are under test.
vi.mock('#/components/admin/editor-container', () => ({
  EditorContainer: () => null,
}));

import { Route as LegacyEditorRoute } from '../admin.$courseId.editor';
import { Route as EditorRoute } from '../admin.editor';

/**
 * Runs a route's real `beforeLoad` and reports where it sent the actor.
 *
 * A redirect is signalled by THROWING, so "allowed" is the absence of a throw.
 * Asserting on a returned value would pass even against a guard that was never
 * wired to the route at all — hence the explicit `typeof` check.
 */
/** Where a thrown `redirect` was aiming, whichever shape it arrived in. */
function redirectTarget(thrown: unknown): string {
  const direct = (thrown as { to?: string }).to;
  return (
    direct ?? (thrown as { options?: { to?: string } }).options?.to ?? 'threw'
  );
}

function enter(
  route: { options: { beforeLoad?: unknown } },
  name: string,
  context: { roles: string[] } = { roles: [] },
): 'allowed' | string {
  const beforeLoad = route.options.beforeLoad;
  if (typeof beforeLoad !== 'function') {
    throw new Error(`${name} has no beforeLoad — the gate is not wired at all`);
  }
  try {
    // biome-ignore lint/suspicious/noExplicitAny: only `context` is read by these guards
    (beforeLoad as (opts: any) => unknown)({ context, params: {} });
    return 'allowed';
  } catch (thrown) {
    return redirectTarget(thrown);
  }
}

describe('/admin/$courseId/editor', () => {
  /**
   * The per-course board this URL rendered is gone; the editor now shows every
   * course at once. Course tiles still link here and people have it
   * bookmarked, so the URL has to keep working — as a redirect to the org
   * editor, not as a 404 and not as an empty screen.
   *
   * Mutant seen RED: `redirect({ to: '/admin' })` — a plausible destination
   * that lands on the course index instead of the editor. This assertion names
   * the exact target, so it fails against it.
   */
  it('redirects to the org-level editor', () => {
    expect(enter(LegacyEditorRoute, '/admin/$courseId/editor')).toBe(
      '/admin/editor',
    );
  });

  /**
   * The redirect must not depend on which course was asked for — every
   * `courseId`, valid or nonsense, has the same answer now.
   *
   * Mutant seen RED: `beforeLoad: ({ params }) => { if (params.courseId) return; throw redirect(...) }`
   * — a guard that only redirects when the param is absent.
   */
  it('redirects whatever course id was asked for', () => {
    const beforeLoad = LegacyEditorRoute.options.beforeLoad;
    if (typeof beforeLoad !== 'function') throw new Error('no beforeLoad');
    for (const courseId of ['1', '999', 'not-a-number']) {
      let target = 'allowed';
      try {
        // biome-ignore lint/suspicious/noExplicitAny: only params/context are read
        (beforeLoad as (opts: any) => unknown)({
          context: { roles: [] },
          params: { courseId },
        });
      } catch (thrown) {
        target = redirectTarget(thrown);
      }
      expect(target).toBe('/admin/editor');
    }
  });
});

describe('/admin/editor guard', () => {
  /**
   * `/api/admin/library` and `/api/admin/editor` both self-guard with
   * `requireAdmin`, so a course- or discipline-scoped staffer who reaches this
   * URL gets two 403s and an error panel blaming a load failure for a refusal.
   * The gate sends them to the admin index, which states its own refusal in
   * words.
   *
   * Mutant seen RED: no `beforeLoad` at all (the `typeof` check throws), and
   * `if (!context.isStaffAnywhere)` in place of the admin check (an SME is
   * then admitted and this returns 'allowed').
   */
  it('turns away a staffer the editor endpoints would refuse', () => {
    expect(
      enter(EditorRoute, '/admin/editor', {
        roles: [],
      }),
    ).toBe('/admin');
  });

  it('admits an admin', () => {
    expect(enter(EditorRoute, '/admin/editor', { roles: ['admin'] })).toBe(
      'allowed',
    );
  });

  it('admits an owner', () => {
    expect(enter(EditorRoute, '/admin/editor', { roles: ['owner'] })).toBe(
      'allowed',
    );
  });

  /**
   * Mutant seen RED: `hasAdminAccess(context.roles) || context.roles.length > 0`
   * — any role at all opens the editor.
   */
  it('turns away someone whose only role is unrelated', () => {
    expect(enter(EditorRoute, '/admin/editor', { roles: ['associate'] })).toBe(
      '/admin',
    );
  });
});
