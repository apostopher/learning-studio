// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ board: vi.fn(), editor: vi.fn() }));

// Both route components reach the whole admin component graph (dnd-kit, Base
// UI, the course board). Stubbed so the routes' own wiring is what is tested —
// and so the stub can record the props each route hands down.
vi.mock('#/components/admin/editor-container', () => ({
  EditorContainer: (props: Record<string, unknown>) => {
    m.editor(props);
    return <div data-testid="org-editor" />;
  },
}));
vi.mock('#/components/admin/course-board-container', () => ({
  CourseBoardContainer: (props: Record<string, unknown>) => {
    m.board(props);
    return <div data-testid="course-board" />;
  },
}));

import { Route as LegacyEditorRoute } from '../admin.$courseId.editor';
import { Route as EditorRoute } from '../admin.editor';

/**
 * Mounts a route's real component. The route's `component` is a code-split
 * lazy wrapper, hence the `preload()` and the `Suspense` boundary — the same
 * shape `admin-shell-nav.test.tsx` uses.
 */
async function mount(
  route: { options: { component?: unknown } },
  name: string,
) {
  const Component = route.options.component as unknown as
    | (React.ComponentType & { preload?: () => Promise<unknown> })
    | undefined;
  if (!Component) {
    throw new Error(`${name} has no component — nothing renders there at all`);
  }
  await Component.preload?.();
  render(
    <Suspense fallback={null}>
      <Component />
    </Suspense>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  m.board.mockClear();
  m.editor.mockClear();
});

/**
 * The two surfaces are siblings, not successors: `/admin/editor` composes
 * courses out of the org's lessons, `/admin/$courseId/editor` configures one
 * course and what its lessons are. An earlier revision of this task redirected
 * the second at the first, which silently took module CRUD, lesson config, the
 * quickshot chips and every course action out of the router — 55 components
 * unreachable. These tests exist so that cannot happen again unnoticed.
 */
describe('/admin/$courseId/editor — the configure surface', () => {
  /**
   * Mutant seen RED: `beforeLoad: () => { throw redirect({ to: '/admin/editor' }) }`
   * — the exact regression this test was written against. It goes red twice
   * over: the guard is no longer absent, and the board never mounts.
   */
  it('throws no redirect and mounts the course board', async () => {
    expect(LegacyEditorRoute.options.beforeLoad).toBeUndefined();

    vi.spyOn(LegacyEditorRoute, 'useParams').mockReturnValue({
      courseId: '5',
    } as never);
    vi.spyOn(LegacyEditorRoute, 'useRouteContext').mockReturnValue({
      roles: ['admin'],
      permissions: ['course:update'],
    } as never);

    await mount(LegacyEditorRoute, '/admin/$courseId/editor');

    await screen.findByTestId('course-board');
    // The param reached the consumer as a number — a board mounted for the
    // wrong course (or for NaN) renders just as happily.
    expect(m.board.mock.calls[0][0].courseId).toBe(5);
  });

  /**
   * The capability flags are the route's other job: it is the only place
   * holding global permissions.
   *
   * Mutant seen RED: `canEditCourse: hasPermissionKey(permissions, 'course', 'read')`
   * — a plausible wrong key that still type-checks and still renders.
   */
  it('reads the course capabilities off the route context', async () => {
    vi.spyOn(LegacyEditorRoute, 'useParams').mockReturnValue({
      courseId: '5',
    } as never);
    vi.spyOn(LegacyEditorRoute, 'useRouteContext').mockReturnValue({
      // An ADMIN holding only `course:update`. The role is required as well
      // as the grant: `PATCH /api/admin/courses/:id` goes through
      // `requirePermission`, which refuses a non-admin before it reads any
      // grant — so a flag built from the grant alone would offer a control
      // that always 403s.
      roles: ['admin'],
      permissions: ['course:update'],
    } as never);

    await mount(LegacyEditorRoute, '/admin/$courseId/editor');
    await screen.findByTestId('course-board');

    expect(m.board.mock.calls[0][0].capabilities).toEqual({
      canEditCourse: true,
      canDeleteCourse: false,
      // True now that the actor is an admin: the RAG corpus is guarded by
      // `requireAdmin` rather than a permission key, so this flag mirrors the
      // role directly. The grant is still what separates edit from delete.
      canTrainCourse: true,
    });
  });
});

describe('/admin/editor — the composing surface', () => {
  it('mounts the knowledge library editor', async () => {
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      roles: ['admin'],
      permissions: ['course:create'],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: false,
    } as never);

    await mount(EditorRoute, '/admin/editor');

    await screen.findByTestId('org-editor');
    expect(m.editor).toHaveBeenCalled();
  });

  /**
   * The two pane-header create actions are the only capabilities this route
   * threads, and each maps to the guard on the endpoint behind it: creating a
   * discipline is `requireAdmin`, creating a course is the `course:create`
   * permission.
   *
   * Mutant seen RED: `canManageDisciplines: hasPermissionKey(permissions,
   * 'course', 'create')` — a plausible copy-paste that still type-checks and
   * still renders, and would hand every course manager the button that
   * appoints subject experts.
   */
  it('lets a course manager create a discipline and an offering, but not rename or delete one', async () => {
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: true,
    } as never);

    await mount(EditorRoute, '/admin/editor');
    await screen.findByTestId('org-editor');

    // The three RBAC rules this route mirrors, in one actor: rule 1 admits a
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
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      roles: [],
      permissions: [],
      isStaffAnywhere: true,
      isCourseManagerAnywhere: false,
    } as never);

    await mount(EditorRoute, '/admin/editor');
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
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      roles: ['admin'],
      permissions: ['course:create', 'course:update', 'course:delete'],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    } as never);

    await mount(EditorRoute, '/admin/editor');
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
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      // Admin, so the org-level floor is met; the grant is what separates
      // edit from delete.
      roles: ['admin'],
      permissions: ['course:update'],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    } as never);

    await mount(EditorRoute, '/admin/editor');
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
    vi.spyOn(EditorRoute, 'useRouteContext').mockReturnValue({
      roles: [],
      permissions: [],
      isStaffAnywhere: false,
      isCourseManagerAnywhere: false,
    } as never);

    await mount(EditorRoute, '/admin/editor');
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

  /**
   * Its two endpoints now guard on `isStaffAnywhere`, which is precisely the
   * population `/admin` itself admits — so a second copy of that condition
   * here would be redundant and would be the first thing to drift. The nav
   * link's gate mirrors the same union and is pinned by
   * `admin-shell-nav.test.tsx`.
   *
   * Mutant seen RED: an admin-only `beforeLoad` restored on this route, which
   * would lock out the discipline SME the screen exists for while every
   * endpoint behind it happily served them.
   */
  it('adds no gate of its own beyond the /admin shell', () => {
    expect(EditorRoute.options.beforeLoad).toBeUndefined();
  });
});
