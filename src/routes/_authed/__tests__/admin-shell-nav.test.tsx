// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The real layout renders the app header, which reaches the whole component
 * graph. Only the two booleans `AdminShell` derives are under test, so the
 * layout is a stub that records the props it was handed — asserting on what the
 * consumer RECEIVED, not on a value recomputed in the test. The two staffing
 * fields are near-identical booleans; a test that re-derived `canSeeCourses`
 * would happily agree with a component reading the wrong one.
 */
type NavProps = {
  canSeePeople: boolean;
  canSeeCourses: boolean;
  canSeeEditor: boolean;
};
let received: NavProps | null = null;
/**
 * Read the recorded props back through a call, so TypeScript sees the declared
 * type rather than narrowing `received` to `never` off the `= null` reset — the
 * stub assigns it from inside a render, which control-flow analysis cannot see.
 */
const recorded = (): NavProps | null => received;
vi.mock('#/components/admin/admin-shell-layout', () => ({
  AdminShellLayout: (props: {
    canSeePeople: boolean;
    canSeeCourses: boolean;
    canSeeEditor: boolean;
  }) => {
    received = {
      canSeePeople: props.canSeePeople,
      canSeeCourses: props.canSeeCourses,
      canSeeEditor: props.canSeeEditor,
    };
    return <div data-testid="admin-shell" />;
  },
}));

import { Route } from '../admin';

type Ctx = {
  roles: string[];
  permissions: string[];
  isStaffAnywhere: boolean;
  isCourseStaffAnywhere: boolean;
};

/**
 * Mounts the real `AdminShell` against a given router context and returns the
 * props it passed down.
 *
 * `useRouteContext` is stubbed on the route object the component calls it
 * through: mounting a real `/admin` match would drag in `_authed`'s session
 * guard and the admin index's loaders, none of which this derivation touches.
 * The component itself is the genuine one — the route's `component` is a
 * code-split lazy wrapper, hence the `preload()` and the `Suspense` boundary.
 */
async function navProps(context: Ctx) {
  // Auto-cleanup only runs between tests; a test that mounts twice would leave
  // two shells in the document and `findByTestId` would refuse to choose.
  cleanup();
  received = null;
  vi.spyOn(Route, 'useRouteContext').mockReturnValue(context as never);
  const Shell = Route.options.component as unknown as
    | (React.ComponentType & { preload?: () => Promise<unknown> })
    | undefined;
  if (!Shell) {
    throw new Error('/admin has no component — the shell is not wired at all');
  }
  await Shell.preload?.();
  render(
    <Suspense fallback={null}>
      <Shell />
    </Suspense>,
  );
  await screen.findByTestId('admin-shell');
  const props = recorded();
  if (!props) throw new Error('AdminShellLayout was never rendered');
  return props;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/admin shell nav', () => {
  /**
   * The whole reason the router context carries two staffing booleans. A
   * discipline-scoped SME is admitted to this shell by `isStaffAnywhere` —
   * they own their discipline's lesson content — but they staff no course, so
   * the course index has nothing to show them. Reading `isStaffAnywhere` here
   * would offer them a link to an empty list, which is the dead end
   * `isCourseStaffAnywhere` exists to prevent.
   */
  it('hides Courses from a discipline-only SME who is inside the shell', async () => {
    const props = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeCourses).toBe(false);
  });

  it('shows Courses to course staff holding no course:read grant', async () => {
    const props = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });

    // The staff-only actor this second term exists for: no catalogue grant,
    // but the index returns their own courses from the same endpoint.
    expect(props.canSeeCourses).toBe(true);
  });

  it('shows Courses to an admin holding course:read who staffs no course', async () => {
    const props = await navProps({
      // The ROLE as well as the grant. `GET /api/admin/courses` goes through
      // `requirePermission`, which refuses a non-admin before it reads any
      // grant — so the link mirrors both halves. Gated on the grant alone, an
      // owner could tick `course:read` for a non-admin role and hand that
      // person a link to a page whose request 403s.
      roles: ['admin'],
      permissions: ['course:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    // An admin's route to the catalogue is the grant, not the staff table —
    // which is why `isCourseStaffAnywhere` may stay false for them.
    expect(props.canSeeCourses).toBe(true);
  });

  it('hides Courses from a non-admin holding course:read', async () => {
    const props = await navProps({
      roles: [],
      permissions: ['course:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    // Mutant this catches — and it is what shipped: the flag built from
    // `hasPermissionKey` alone, which is more permissive than the endpoint it
    // stands for.
    expect(props.canSeeCourses).toBe(false);
  });

  it('hides Courses from someone with neither', async () => {
    const props = await navProps({
      roles: [],
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeCourses).toBe(false);
  });

  /**
   * The knowledge library is the screen the discipline-scoped SME exists for,
   * and its two endpoints (`/api/admin/library`, `/api/admin/editor`) gate on
   * `isStaffAnywhere` — so this link must too. This is the case that makes
   * `canSeeEditor` and `canSeeCourses` read DIFFERENT staffing booleans: the
   * same actor gets the library and not the course index, because the index
   * would come back empty for them and the library comes back full.
   *
   * Mutant seen RED: `canSeeEditor = hasAdminAccess(roles) || isCourseStaffAnywhere`
   * (the Courses link's condition, copied) — the SME loses the one screen
   * built for them while every endpoint behind it serves them happily.
   */
  it('shows the editor to a discipline-only SME who staffs no course', async () => {
    const props = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeEditor).toBe(true);
    // And the pairing that makes it worth two booleans.
    expect(props.canSeeCourses).toBe(false);
  });

  /**
   * Mutant seen RED: `canSeeEditor = hasAdminAccess(roles)` — the admin-only
   * floor this round widened, which locks course staff out of a pane whose
   * whole right-hand side is course composition.
   */
  it('shows the editor to course staff holding no global role', async () => {
    const props = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });

    expect(props.canSeeEditor).toBe(true);
  });

  it('shows the editor to an admin holding no grants and staffing nothing', async () => {
    const props = await navProps({
      roles: ['admin'],
      permissions: [],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    // `hasAdminAccess` reads roles, not grants — an admin with an empty
    // `role_permissions` set still gets the editor.
    expect(props.canSeeEditor).toBe(true);
  });

  /**
   * A learner has no standing on the teaching side at all. (They never reach
   * this shell either — `beforeLoad` turns them away — but the link's own
   * condition must not be the thing that would have let them through.)
   *
   * Mutant seen RED: `canSeeEditor = true` — a constant, which every
   * positive case above would happily pass.
   */
  it('hides the editor from a learner with no standing anywhere', async () => {
    const props = await navProps({
      roles: ['associate'],
      permissions: [],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeEditor).toBe(false);
  });

  it('gates People on user:read plus the admin floor, never on staffing', async () => {
    const granted = await navProps({
      roles: ['admin'],
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });
    const staffOnly = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });
    const grantWithoutTheFloor = await navProps({
      roles: [],
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    expect(granted.canSeePeople).toBe(true);
    // Staffing is not a route to People, and never was.
    expect(staffOnly.canSeePeople).toBe(false);
    // Nor is the grant on its own: `GET /api/admin/users` refuses a
    // non-admin before it reads any grant, so a link shown here would lead
    // straight to a 403. The permission grid lets an owner tick `user:read`
    // for a non-admin role, which is how this is reachable.
    expect(grantWithoutTheFloor.canSeePeople).toBe(false);
  });
});
