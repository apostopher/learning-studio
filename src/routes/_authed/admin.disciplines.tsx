import { createFileRoute, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { DisciplinesPageContainer } from '#/components/admin/disciplines-page-container';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * Disciplines: create them, rename them, delete the empty ones, and appoint
 * the Subject Experts who may author the lessons filed under each.
 *
 * A SIBLING page rather than a panel hanging off the library editor's
 * discipline columns, for one reason: the two screens have different
 * audiences. `/admin/editor` admits anyone `isStaffAnywhere` — a
 * discipline-only SME included, since it is the screen built for them — while
 * every endpoint behind THIS one is `requireAdmin`. A control mounted in those
 * columns would be visible to the population least able to use it, and the
 * only honest thing it could do is refuse, which is a worse answer than not
 * being there. Splitting them keeps "who may do this" answered once, in the
 * nav gate and the route gate, instead of per-control inside a shared screen.
 *
 * Gated in `beforeLoad` rather than in the component, so someone who is in the
 * `/admin` shell on staff standing alone never sees a flash of a page they
 * cannot use. `hasAdminAccess(roles)` mirrors `requireAdmin` exactly — the
 * same function that guard calls. This is a courtesy, not the boundary: every
 * route behind the screen self-guards.
 */
export const Route = createFileRoute('/_authed/admin/disciplines')({
  beforeLoad: ({ context }) => {
    if (!hasAdminAccess(context.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: DisciplinesRoute,
});

function DisciplinesRoute() {
  return <DisciplinesPageContainer />;
}
