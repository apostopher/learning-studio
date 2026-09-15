// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSectionId } from '#/lib/admin-sections';

const m = vi.hoisted(() => ({
  editor: vi.fn(),
  schedule: vi.fn(),
  users: vi.fn(),
}));

// Each section screen reaches the whole admin component graph (dnd-kit, Base
// UI, TanStack Table). Stubbed so the route's own wiring is what is tested —
// and so the stubs can record the props each section is handed.
vi.mock('#/components/admin/editor-container', () => ({
  EditorContainer: (props: Record<string, unknown>) => {
    m.editor(props);
    return <div data-testid="org-editor" />;
  },
}));
vi.mock('#/components/admin/schedule/schedule-page-container', () => ({
  SchedulePageContainer: (props: Record<string, unknown>) => {
    m.schedule(props);
    return <div data-testid="schedule" />;
  },
}));
vi.mock('#/components/admin/courses-section-container', () => ({
  CoursesSectionContainer: () => <div data-testid="courses" />,
}));
vi.mock('#/components/admin/users/users-page-container', () => ({
  UsersPageContainer: (props: Record<string, unknown>) => {
    m.users(props);
    return <div data-testid="people" />;
  },
}));

/** The `?section=` the screen reads, made settable. nuqs is otherwise real. */
const url = { section: 'knowledge-library' as AdminSectionId };
vi.mock('nuqs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('nuqs')>()),
  useQueryState: () => [url.section, vi.fn()],
}));

import { Route } from '../admin.index';

type Ctx = {
  roles: string[];
  permissions: string[];
  isStaffAnywhere: boolean;
  isCourseManagerAnywhere: boolean;
};

const ADMIN: Ctx = {
  roles: ['admin'],
  permissions: ['course:create', 'course:update', 'course:delete'],
  isStaffAnywhere: true,
  isCourseManagerAnywhere: true,
};

/**
 * Mounts the real section screen at a given `?section=`. The route's
 * `component` is a code-split lazy wrapper, hence the `preload()` and the
 * `Suspense` boundary.
 */
async function mountSection(section: AdminSectionId, context: Ctx = ADMIN) {
  cleanup();
  url.section = section;
  vi.spyOn(Route, 'useRouteContext').mockReturnValue(context as never);
  const Component = Route.options.component as unknown as
    | (React.ComponentType & { preload?: () => Promise<unknown> })
    | undefined;
  if (!Component) {
    throw new Error('/admin has no component — no section renders at all');
  }
  await Component.preload?.();
  render(
    <Suspense fallback={null}>
      <Component />
    </Suspense>,
  );
}

/**
 * Runs the real section gate and reports where it sent the actor. `beforeLoad`
 * signals a refusal by throwing, so "allowed" is the absence of a throw —
 * asserting on a returned value would pass even if the gate stopped being
 * wired to the route.
 */
function enter(
  section: AdminSectionId | undefined,
  context: Partial<{
    roles: string[];
    permissions: string[];
    isStaffAnywhere: boolean;
    isCourseStaffAnywhere: boolean;
  }>,
): string {
  const beforeLoad = Route.options.beforeLoad;
  if (typeof beforeLoad !== 'function') {
    throw new Error('the section screen has no beforeLoad — no gate at all');
  }
  try {
    beforeLoad({
      context: {
        roles: [],
        permissions: [],
        isStaffAnywhere: false,
        isCourseStaffAnywhere: false,
        ...context,
      },
      search: { section },
      // biome-ignore lint/suspicious/noExplicitAny: only `context` and `search` are read by this guard
    } as any);
    return 'allowed';
  } catch (thrown) {
    // The section it was sent to, not just the path: every redirect here goes
    // to `/admin`, so the path alone cannot tell a refusal from the default.
    const redirected = thrown as {
      to?: string;
      search?: { section?: string };
      options?: { to?: string; search?: { section?: string } };
    };
    const to = redirected.to ?? redirected.options?.to;
    if (!to) return 'threw';
    const sent = redirected.search ?? redirected.options?.search;
    return `${to}?section=${sent?.section}`;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  m.editor.mockClear();
  m.schedule.mockClear();
  m.users.mockClear();
  url.section = 'knowledge-library';
});

describe('/admin — which section renders', () => {
  /**
   * The four sections are one route now, chosen by the URL. These are the
   * tests that go red if a section stops being reachable at all — the failure
   * mode of collapsing four routes into one.
   */
  it('renders the knowledge library on a bare /admin', async () => {
    await mountSection('knowledge-library');

    expect(await screen.findByTestId('org-editor')).toBeDefined();
    expect(screen.queryByTestId('schedule')).toBeNull();
    expect(screen.queryByTestId('people')).toBeNull();
  });

  it('renders the schedule board at ?section=schedule', async () => {
    await mountSection('schedule');

    expect(await screen.findByTestId('schedule')).toBeDefined();
    expect(screen.queryByTestId('org-editor')).toBeNull();
  });

  it('renders People at ?section=people', async () => {
    await mountSection('people');

    expect(await screen.findByTestId('people')).toBeDefined();
    expect(screen.queryByTestId('org-editor')).toBeNull();
  });

  it('renders the Courses screen at ?section=courses', async () => {
    await mountSection('courses');

    expect(await screen.findByTestId('courses')).toBeDefined();
    expect(screen.queryByTestId('org-editor')).toBeNull();
  });
});

describe('/admin — what each section is handed', () => {
  /**
   * The route is the only place holding global permissions, so each section
   * still receives its capability flags from here.
   *
   * Mutant seen RED: `canSchedule` reading `course:read` — a plausible wrong
   * key that still type-checks and still renders, and would offer the
   * scheduling controls to everyone who can merely see the board.
   */
  it('gives the schedule the create union, not the read grant', async () => {
    await mountSection('schedule', {
      roles: [],
      permissions: ['course:read'],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('schedule');
    // `lastCall`, not `calls[0]`: this test mounts twice and the stub records
    // both.
    expect(m.schedule.mock.lastCall?.[0].canSchedule).toBe(false);

    await mountSection('schedule', {
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      // The same union the API's write guard uses (`requireCourseCreation`,
      // RBAC rule 5): a course manager or an admin.
      isCourseManagerAnywhere: true,
    });
    await screen.findByTestId('schedule');
    expect(m.schedule.mock.lastCall?.[0].canSchedule).toBe(true);
  });

  it('gives People the roles and permissions it filters on', async () => {
    await mountSection('people', {
      roles: ['admin'],
      permissions: ['user:read'],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('people');

    expect(m.users.mock.calls[0][0]).toMatchObject({
      roles: ['admin'],
      permissions: ['user:read'],
    });
  });

  /**
   * The library's capability flags, each mirroring the guard on the endpoint
   * behind it.
   *
   * Mutant seen RED: `canManageDisciplines: hasPermissionKey(permissions,
   * 'course', 'create')` — a plausible copy-paste that still type-checks and
   * still renders, and would hand every course manager the button that
   * appoints subject experts.
   */
  it('lets a course manager create a discipline and an offering, but not rename or delete one', async () => {
    await mountSection('knowledge-library', {
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: true,
    });
    await screen.findByTestId('org-editor');

    // The three RBAC rules this screen mirrors, in one actor: rule 1 admits a
    // course manager to discipline CREATION, rule 5 to offerings, and rule 3
    // keeps rename/delete admin-only. This actor holds no global role and no
    // permission at all, so every `true` here comes from the staffing flags.
    expect(m.editor.mock.calls[0][0].capabilities).toEqual({
      canCreateDiscipline: true,
      canManageDisciplines: false,
      canCreateCourse: true,
      // Creating an offering and EDITING one are separate rules: rule 5 named
      // course managers for creation alone. Mutant this catches: reusing the
      // create union for edit/delete, handing every course manager the
      // delete-course button.
      canEditCourse: false,
      canDeleteCourse: false,
    });
  });

  it('lets a discipline-only SME create a discipline but not an offering', async () => {
    await mountSection('knowledge-library', {
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('org-editor');

    // Mutant seen RED: `canCreateCourse` reading `isStaffAnywhere` instead of
    // `isCourseManagerAnywhere` — the two are equal for a course manager, so
    // only a discipline-only SME separates them. Rule 5 lists course managers
    // and admins; a subject expert authors lessons and does not decide which
    // courses the org sells.
    expect(m.editor.mock.calls[0][0].capabilities).toEqual({
      canCreateDiscipline: true,
      canManageDisciplines: false,
      canCreateCourse: false,
      canEditCourse: false,
      canDeleteCourse: false,
    });
  });

  it('gives an admin every action, including the two staffing flags cannot grant', async () => {
    await mountSection('knowledge-library', {
      roles: ['admin'],
      permissions: ['course:create', 'course:update', 'course:delete'],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('org-editor');

    // Both staffing flags are false, so an admin who staffs nothing must be
    // admitted by their ROLE alone. Mutant seen RED: dropping the
    // `hasAdminAccess(roles) ||` half of `canCreateDiscipline`.
    expect(m.editor.mock.calls[0][0].capabilities).toEqual({
      canCreateDiscipline: true,
      canManageDisciplines: true,
      canCreateCourse: true,
      canEditCourse: true,
      canDeleteCourse: true,
    });
  });

  it('reads edit and delete off their own permission keys', async () => {
    await mountSection('knowledge-library', {
      // Admin, so the org-level floor is met; the grant is what separates
      // edit from delete.
      roles: ['admin'],
      permissions: ['course:update'],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('org-editor');

    // Mutant this catches: both reading `course:update` (or both `delete`) —
    // a plausible copy-paste that every other test here would still pass,
    // and that would put a delete-course button in front of someone holding
    // only the right to rename one.
    expect(m.editor.mock.calls[0][0].capabilities).toMatchObject({
      canEditCourse: true,
      canDeleteCourse: false,
    });
  });

  it('gives a learner who wandered in nothing at all', async () => {
    await mountSection('knowledge-library', {
      roles: [],
      permissions: [],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    });
    await screen.findByTestId('org-editor');

    // Mutant this catches: any flag hardcoded to `true`, which every test
    // above would still pass.
    expect(m.editor.mock.calls[0][0].capabilities).toEqual({
      canCreateDiscipline: false,
      canManageDisciplines: false,
      canCreateCourse: false,
      canEditCourse: false,
      canDeleteCourse: false,
    });
  });
});

describe('/admin — priming People', () => {
  /**
   * With `defaultPreload: 'intent'` the loader runs when the People link is
   * HOVERED, so the request is usually in flight by the time the click lands.
   * One route now serves every section, so the loader runs on every section
   * change and has to say which section it is for.
   *
   * This file is jsdom, so `window` exists — the browser half of the
   * behaviour. `admin-section-loader.test.ts` is the node half, where the same
   * call must prime nothing at all.
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

  it('primes the users list for People', () => {
    expect(prime('people')).toHaveBeenCalled();
  });

  /**
   * Mutant seen RED: the section check dropped — which fires a users request
   * every time anyone opens the schedule or the library, on a screen that
   * never reads it.
   */
  it('primes nothing for the sections that never read it', () => {
    expect(prime('schedule')).not.toHaveBeenCalled();
    expect(prime('knowledge-library')).not.toHaveBeenCalled();
    expect(prime('courses')).not.toHaveBeenCalled();
  });
});

describe('/admin — entering a section by URL', () => {
  /**
   * The mirror image of the dead-end link the nav refuses to render: a section
   * the nav withholds must not be reachable by typing its URL either. Both
   * read the same `adminSectionGates`.
   *
   * Mutant seen RED: `beforeLoad` removed — the SME types the schedule's URL
   * and gets an empty board with no explanation.
   */
  it('sends a discipline-only SME asking for the schedule back to the default', () => {
    expect(enter('schedule', { isStaffAnywhere: true })).toBe(
      '/admin?section=knowledge-library',
    );
  });

  it('sends someone with no user:read asking for people back to the default', () => {
    expect(
      enter('people', { isStaffAnywhere: true, isCourseStaffAnywhere: true }),
    ).toBe('/admin?section=knowledge-library');
  });

  it('admits course staff to the schedule', () => {
    expect(
      enter('schedule', { isStaffAnywhere: true, isCourseStaffAnywhere: true }),
    ).toBe('allowed');
  });

  it('admits an admin to people', () => {
    expect(
      enter('people', { roles: ['admin'], permissions: ['user:read'] }),
    ).toBe('allowed');
  });

  /**
   * The default section can never be the one refused — `/admin`'s own guard
   * admits exactly the actors it admits — and the gate is written so that a
   * refusal could not redirect to itself even if that stopped being true.
   *
   * Mutant seen RED: the `section === DEFAULT_ADMIN_SECTION` early return
   * dropped and the library's gate closed, which is an infinite redirect.
   */
  it('never refuses the default section, even to an actor holding nothing', () => {
    expect(enter('knowledge-library', {})).toBe('allowed');
  });

  /**
   * A bare `/admin` is normalised rather than left implicit. All four sections
   * share one pathname, so `?section=` is the only thing the nav can match a
   * link against — and that match is a subset test, in which an empty search
   * is contained in every URL, so the library's link would read as active on
   * all four.
   *
   * Mutant seen RED: the normalising redirect dropped — every section screen
   * then shows two current links, one of them wrong.
   */
  it('normalises a bare /admin to the default section', () => {
    expect(enter(undefined, { isStaffAnywhere: true })).toBe(
      '/admin?section=knowledge-library',
    );
  });

  it('admits course staff and course readers to courses, and turns a discipline-only SME back', () => {
    expect(enter('courses', { isCourseStaffAnywhere: true })).toBe('allowed');
    expect(enter('courses', { isStaffAnywhere: true })).toBe(
      '/admin?section=knowledge-library',
    );
    // And withholds it from someone with no standing — the shell turns them
    // away first, but this must not be the thing that would have let them in.
    expect(enter('courses', {})).toBe('/admin?section=knowledge-library');
  });
});
