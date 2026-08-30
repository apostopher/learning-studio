// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ board: vi.fn(), editor: vi.fn() }));

// Both route components reach the whole admin component graph (dnd-kit, Base
// UI, the course board). Stubbed so the routes' own wiring is what is tested —
// and so the stub can record the props each route hands down.
vi.mock('#/components/admin/editor-container', () => ({
  EditorContainer: () => {
    m.editor();
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
      roles: [],
      permissions: ['course:update'],
    } as never);

    await mount(LegacyEditorRoute, '/admin/$courseId/editor');
    await screen.findByTestId('course-board');

    expect(m.board.mock.calls[0][0].capabilities).toEqual({
      canEditCourse: true,
      canDeleteCourse: false,
      canTrainCourse: false,
    });
  });
});

describe('/admin/editor — the composing surface', () => {
  it('mounts the knowledge library editor', async () => {
    await mount(EditorRoute, '/admin/editor');

    await screen.findByTestId('org-editor');
    expect(m.editor).toHaveBeenCalled();
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
