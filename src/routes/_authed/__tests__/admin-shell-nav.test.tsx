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
type NavProps = { canSeePeople: boolean; canSeeCourses: boolean };
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
  }) => {
    received = {
      canSeePeople: props.canSeePeople,
      canSeeCourses: props.canSeeCourses,
    };
    return <div data-testid="admin-shell" />;
  },
}));

import { Route } from '../admin';

type Ctx = {
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
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeCourses).toBe(false);
  });

  it('shows Courses to course staff holding no course:read grant', async () => {
    const props = await navProps({
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });

    // The staff-only actor this second term exists for: no catalogue grant,
    // but the index returns their own courses from the same endpoint.
    expect(props.canSeeCourses).toBe(true);
  });

  it('shows Courses to a course:read holder who staffs no course', async () => {
    const props = await navProps({
      permissions: ['course:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    // An admin's route to the catalogue is the grant, not the staff table —
    // which is why `isCourseStaffAnywhere` may stay false for them.
    expect(props.canSeeCourses).toBe(true);
  });

  it('hides Courses from someone with neither', async () => {
    const props = await navProps({
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    expect(props.canSeeCourses).toBe(false);
  });

  it('gates People on user:read alone, never on staffing', async () => {
    const granted = await navProps({
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });
    const staffOnly = await navProps({
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });

    expect(granted.canSeePeople).toBe(true);
    expect(staffOnly.canSeePeople).toBe(false);
  });
});
