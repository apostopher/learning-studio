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
import {
  ADMIN_SECTION_LABELS,
  type AdminSectionId,
  visibleAdminSections,
} from '#/lib/admin-sections';
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

/** Every section, in nav order — what an admin is offered. */
const ALL = visibleAdminSections({
  'knowledge-library': true,
  '3d-airmanship': true,
  schedule: true,
  people: true,
});

const sectionsOf = (...ids: AdminSectionId[]) =>
  ids.map((id) => ({ id, label: ADMIN_SECTION_LABELS[id] }));

/**
 * `url` is the location the shell is rendered at — the nav's highlight comes
 * from the router matching each link against it, so it is the only input that
 * decides which section reads as current.
 */
const renderAdmin = async (
  sections: { id: AdminSectionId; label: string }[] = ALL,
  url = '/admin?section=knowledge-library',
) => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  });
  // Mirrors the real tree: the shell renders the nav around whichever child
  // is showing — a section at `/admin` itself, or the course board, which is a
  // screen you go INTO from a section.
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => (
      <AdminShellLayout sections={sections}>
        <Outlet />
      </AdminShellLayout>
    ),
  });
  const sectionRoute = createRoute({
    getParentRoute: () => adminRoute,
    path: '/',
    component: () => <p>Section body</p>,
  });
  const boardRoute = createRoute({
    getParentRoute: () => adminRoute,
    path: '$courseId/editor',
    component: () => <p>Section body</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      adminRoute.addChildren([sectionRoute, boardRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test-only router tree, not the app's registered one */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('Section body')).toBeDefined());
};

const navLinks = () =>
  Array.from(
    screen
      .getByRole('navigation', { name: 'Admin sections' })
      .querySelectorAll('a'),
  );

describe('AdminShellLayout', () => {
  /**
   * The requirement is that sign-out is reachable from every screen inside the
   * app. Admin had no sign-out at all before this was added, so this is the
   * test that goes red if the header ever stops being mounted here.
   */
  it('puts a sign-out control on admin screens', async () => {
    await renderAdmin();

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('offers a way back to /app', async () => {
    await renderAdmin();

    const home = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/app');
    expect(home).toBeDefined();
  });

  /**
   * The header is never permission-gated: an admin whose only section is the
   * library still needs to be able to leave.
   */
  it('keeps sign-out reachable when only one section is offered', async () => {
    await renderAdmin(sectionsOf('knowledge-library'));

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  /**
   * The nav renders the sections it is given, in the order it is given them —
   * `ADMIN_SECTION_IDS` is the one place that order lives, and
   * `admin-sections.test.ts` pins the order itself. This is the test that goes
   * red if the layout sorts, groups or reverses them on the way out.
   */
  it('reads knowledge library, 3D airmanship, schedule, people — in that order', async () => {
    await renderAdmin();

    expect(navLinks().map((a) => a.textContent?.trim())).toEqual([
      'Knowledge library',
      '3D airmanship',
      'Schedule',
      'People',
    ]);
  });

  /**
   * Every link names its section, the default one included. All four share one
   * pathname, so the search parameter is the only thing distinguishing them —
   * and the router's match is a SUBSET test, in which an empty search is
   * contained in every URL.
   *
   * Mutant seen RED: `search={section === DEFAULT_ADMIN_SECTION ? {} : { section }}`
   * — a tidier-looking URL for the default section that makes its link read as
   * active on all four, which the two highlight tests below then catch.
   */
  it('links each section by query parameter, the default one included', async () => {
    await renderAdmin();

    expect(navLinks().map((a) => a.getAttribute('href'))).toEqual([
      '/admin?section=knowledge-library',
      '/admin?section=3d-airmanship',
      '/admin?section=schedule',
      '/admin?section=people',
    ]);
  });

  /**
   * The links must stay LINKS: a section is a URL, so it has to be
   * middle-clickable, copyable and reachable with the keyboard as a link.
   *
   * Mutant this catches: nav items rewritten as buttons calling the nuqs
   * setter, which looks identical and is none of those things.
   */
  it('renders sections as links, not buttons', async () => {
    await renderAdmin();

    expect(navLinks()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
  });

  /**
   * The highlight is the only thing that says which section you are in, so it
   * has to be said out loud too — `aria-current` for a screen reader, the
   * `data-status` styling for everyone else. Both come from the router
   * matching the link against the URL.
   */
  it('marks exactly the section named in the URL', async () => {
    await renderAdmin(ALL, '/admin?section=schedule');

    const current = navLinks().filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(current.map((a) => a.textContent?.trim())).toEqual(['Schedule']);
    expect(current[0].getAttribute('data-status')).toBe('active');
  });

  it('marks the knowledge library on the default section', async () => {
    await renderAdmin();

    expect(
      navLinks()
        .filter((a) => a.getAttribute('aria-current') === 'page')
        .map((a) => a.textContent?.trim()),
    ).toEqual(['Knowledge library']);
  });

  /**
   * `/admin/$courseId/editor` is a screen you go INTO from the knowledge
   * library, not a section — the nav is on screen while it is open, and
   * lighting a section up there would name a place you are not.
   *
   * Mutant seen RED: `activeOptions` dropped, whose default is a PREFIX match
   * on the path — every section link then reads as active on every course
   * board.
   */
  it('marks nothing while a course board is open', async () => {
    await renderAdmin(ALL, '/admin/7/editor');

    expect(
      navLinks().filter((a) => a.getAttribute('aria-current') === 'page'),
    ).toHaveLength(0);
  });

  /**
   * A nav with no links must not be a bare strip — an actor who can reach no
   * section is told why, in text assistive tech reaches.
   */
  it('explains itself when no section is available', async () => {
    await renderAdmin([]);

    expect(navLinks()).toHaveLength(0);
    expect(
      screen.getByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeDefined();
  });

  it('says nothing about permissions when a section is available', async () => {
    await renderAdmin(sectionsOf('knowledge-library'));

    expect(
      screen.queryByText(
        'No admin sections are available with your current permissions.',
      ),
    ).toBeNull();
  });

  /**
   * The course index that used to sit at `/admin` is retired: courses are
   * composed from the knowledge library's right-hand pane. There is no
   * Disciplines link either, and that absence is a decision rather than an
   * omission — a discipline IS a column of that same pane, created, renamed,
   * staffed and deleted from the column itself.
   *
   * Mutant this catches: either link being restored as part of "adding back" a
   * nav item someone assumes went missing.
   */
  it('offers no Courses or Disciplines link — both are the library now', async () => {
    await renderAdmin();

    expect(screen.queryByRole('link', { name: 'Courses' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Disciplines' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Knowledge library' }),
    ).toBeDefined();
  });
});
