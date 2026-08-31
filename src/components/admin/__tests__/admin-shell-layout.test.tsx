// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShellLayout } from '../admin-shell-layout';

vi.mock('../../logo', () => ({
  Logo: ({ className }: { className?: string }) => (
    <span data-testid="logo" className={className} />
  ),
}));

vi.mock('../../../styles/theme.generated', () => ({
  appTitle: 'Test Academy',
  logoLight: { kind: 'url', src: '/logo.png' },
  logoDark: { kind: 'url', src: '/logo.png' },
}));

const renderAdmin = async (
  canSeePeople: boolean,
  canSeeCourses = true,
  canSeeEditor = false,
  canSeeDisciplines = false,
) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/users',
    component: () => null,
  });
  const editorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/editor',
    component: () => null,
  });
  const disciplinesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/disciplines',
    component: () => null,
  });
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => (
      <AdminShellLayout
        canSeePeople={canSeePeople}
        canSeeCourses={canSeeCourses}
        canSeeEditor={canSeeEditor}
        canSeeDisciplines={canSeeDisciplines}
      >
        <p>Course list</p>
      </AdminShellLayout>
    ),
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      usersRoute,
      editorRoute,
      disciplinesRoute,
      adminRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/admin'] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('Course list')).toBeDefined());
};

describe('AdminShellLayout', () => {
  /**
   * The requirement is that sign-out is reachable from every screen inside the
   * app. Admin had no sign-out at all before this change, so this is the test
   * that goes red if the header ever stops being mounted here.
   */
  it('puts a sign-out control on admin screens', async () => {
    await renderAdmin(true);

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('offers a way back to /app', async () => {
    await renderAdmin(true);

    const home = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/app');
    expect(home).toBeDefined();
  });

  /**
   * The header is never permission-gated: an admin without `user:read`
   * still needs to be able to leave.
   */
  it('keeps sign-out reachable when the People link is hidden', async () => {
    await renderAdmin(false);

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  /**
   * `canSeePeople` used to gate the entire `<nav>`, so an admin without
   * `user:read` — the default, since `role_permissions` ships empty — lost
   * the Courses link too and got a nav-less shell. Both links are conditional
   * now, but each on its OWN destination: losing People must never take
   * Courses with it.
   */
  it('keeps the Courses link when the actor cannot see People', async () => {
    await renderAdmin(false);

    expect(screen.getByRole('link', { name: 'Courses' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
  });

  it('shows the People link when the actor can see People', async () => {
    await renderAdmin(true);

    expect(screen.getByRole('link', { name: 'Courses' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'People' })).toBeDefined();
  });

  /**
   * `/admin` now admits course-scoped staff, so the Courses link stopped being
   * unconditional: an admin with an empty grant set and no `course_staff` row
   * gets a 403 from the course endpoint, and a link that bounces is worse than
   * no link.
   */
  it('hides the Courses link when the course index has nothing for the actor', async () => {
    await renderAdmin(true, false);

    expect(screen.queryByRole('link', { name: 'Courses' })).toBeNull();
    expect(screen.getByRole('link', { name: 'People' })).toBeDefined();
  });

  /**
   * A nav with no links must not be a bare strip — an actor who can reach
   * neither section is told why, in text assistive tech reaches.
   */
  it('explains itself when neither section is available', async () => {
    await renderAdmin(false, false);

    expect(screen.queryAllByRole('link', { name: 'Courses' })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: 'People' })).toHaveLength(0);
    expect(
      screen.getByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeDefined();
  });

  /**
   * The knowledge library editor is its own destination with its own gate, so
   * it must survive the loss of the other two — the same independence bug the
   * Courses/People pair was fixed for. Named "Knowledge library", not
   * "Library": the editor's own left-hand pane already carries that word.
   */
  it('shows the Knowledge library link on its own gate alone', async () => {
    await renderAdmin(false, false, true);

    expect(
      screen.getByRole('link', { name: 'Knowledge library' }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Courses' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
    // And an actor who has one section is not told they have none.
    expect(
      screen.queryByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeNull();
  });

  it('hides the Knowledge library link when its gate is closed', async () => {
    await renderAdmin(true, true, false);

    expect(
      screen.queryByRole('link', { name: 'Knowledge library' }),
    ).toBeNull();
  });

  /**
   * Disciplines is admin-only — every endpoint behind it is `requireAdmin`, so
   * that a Subject Expert cannot appoint a peer to their own discipline. Like
   * the other three it stands on its own gate: an admin who holds no grant at
   * all still administers the org's disciplines.
   *
   * Mutant seen RED: the link rendered inside the `canSeeEditor` block (the
   * obvious "they're both new admin screens" merge) — a discipline-only SME
   * would then be handed a link to a page every one of whose endpoints refuses
   * them.
   */
  it('shows the Disciplines link on its own gate alone', async () => {
    await renderAdmin(false, false, false, true);

    expect(screen.getByRole('link', { name: 'Disciplines' })).toBeDefined();
    expect(
      screen.queryByRole('link', { name: 'Knowledge library' }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Courses' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
    // And an actor who has one section is not told they have none.
    expect(
      screen.queryByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeNull();
  });

  it('hides the Disciplines link when its gate is closed', async () => {
    await renderAdmin(true, true, true, false);

    expect(screen.queryByRole('link', { name: 'Disciplines' })).toBeNull();
  });

  it('says nothing about permissions when a section is available', async () => {
    await renderAdmin(false, true);

    expect(
      screen.queryByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeNull();
  });
});
