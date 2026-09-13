// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSectionId } from '#/lib/admin-sections';

/**
 * The real layout renders the app header, which reaches the whole component
 * graph. Only what `AdminShell` hands DOWN is under test, so the layout is a
 * stub that records the props it was given — asserting on what the consumer
 * RECEIVED, not on a value recomputed in the test.
 */
type NavProps = {
  sections: { id: AdminSectionId; label: string }[];
};
let received: NavProps | null = null;
/**
 * Read the recorded props back through a call, so TypeScript sees the declared
 * type rather than narrowing `received` to `never` off the `= null` reset — the
 * stub assigns it from inside a render, which control-flow analysis cannot see.
 */
const recorded = (): NavProps | null => received;
vi.mock('#/components/admin/admin-shell-layout', () => ({
  AdminShellLayout: (props: NavProps) => {
    received = { sections: props.sections };
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
 * guard and the section screen's loader, none of which this wiring touches.
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

const STAFF: Ctx = {
  roles: [],
  permissions: [],
  isStaffAnywhere: true,
  isCourseStaffAnywhere: true,
};

describe('/admin shell nav', () => {
  /**
   * The wiring this test exists for: the nav is fed by `adminSectionGates`,
   * the same call the section screen's `beforeLoad` makes. Two copies of those
   * conditions is how a link and its destination come to disagree — a link
   * that redirects straight back, or a section reachable by URL that the nav
   * deliberately withholds. `admin-sections.test.ts` pins the conditions
   * themselves; this pins that the shell asks.
   *
   * Mutant seen RED: the shell filtering on `isStaffAnywhere` alone, which
   * hands a discipline-only SME a Schedule link to an empty board.
   */
  it('offers a discipline-only SME the library and 3D airmanship, and no more', async () => {
    const props = await navProps({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseStaffAnywhere: false,
    });

    expect(props.sections.map((s) => s.id)).toEqual([
      'knowledge-library',
      '3d-airmanship',
    ]);
  });

  it('offers an admin every section, in nav order', async () => {
    const props = await navProps({
      roles: ['admin'],
      permissions: ['course:read', 'user:read'],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    });

    expect(props.sections.map((s) => s.id)).toEqual([
      'knowledge-library',
      '3d-airmanship',
      'schedule',
      'people',
    ]);
    // The labels travel with the ids — a section offered without one would
    // render a blank link.
    expect(props.sections[3].label).toBe('People');
  });

  it('offers course staff the schedule without offering people', async () => {
    const props = await navProps(STAFF);

    expect(props.sections.map((s) => s.id)).toEqual([
      'knowledge-library',
      '3d-airmanship',
      'schedule',
    ]);
  });
});
