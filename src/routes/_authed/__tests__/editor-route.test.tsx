// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ board: vi.fn() }));

// The board reaches the whole admin component graph (dnd-kit, Base UI).
// Stubbed so the route's own wiring is what is tested — and so the stub can
// record the props the route hands down.
vi.mock('#/components/admin/course-board-container', () => ({
  CourseBoardContainer: (props: Record<string, unknown>) => {
    m.board(props);
    return <div data-testid="course-board" />;
  },
}));

import { Route as LegacyEditorRoute } from '../admin.$courseId.editor';

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
});

/**
 * The two surfaces are siblings, not successors: the knowledge library
 * (`/admin`, the default section) composes courses out of the org's lessons,
 * `/admin/$courseId/editor` configures one course and what its lessons are. An
 * earlier revision redirected the second at the first, which silently took
 * module CRUD, lesson config, the quickshot chips and every course action out
 * of the router — 55 components unreachable. These tests exist so that cannot
 * happen again unnoticed.
 *
 * It is also why this stayed a route of its own when the sections became
 * `?section=` values: it takes a path parameter and is a screen you go INTO
 * from a section, not a section.
 */
describe('/admin/$courseId/editor — the configure surface', () => {
  /**
   * Mutant seen RED: `beforeLoad: () => { throw redirect({ to: '/admin' }) }`
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
