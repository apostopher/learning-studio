import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQueryState } from 'nuqs';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { CoursesSectionContainer } from '#/components/admin/courses-section-container';
import { EditorContainer } from '#/components/admin/editor-container';
import { SchedulePageContainer } from '#/components/admin/schedule/schedule-page-container';
import { UsersPageContainer } from '#/components/admin/users/users-page-container';
import { adminUsersQueryOptions } from '#/data-hooks/use-admin-users';
import { hasAdminAccess, hasOrgPermission } from '#/lib/admin-schemas';
import {
  adminSearchSchema,
  adminSectionGates,
  adminSectionParser,
  DEFAULT_ADMIN_SECTION,
} from '#/lib/admin-sections';

/**
 * Every admin section lives here, chosen by `?section=` — the knowledge
 * library by default, so a bare `/admin` opens on it.
 *
 * One route rather than four, because a section is a piece of URL STATE
 * rather than a place: the shell, its nav and its scroll container are the
 * same either way, and the sections are lateral — none is deeper than
 * another. `/admin/$courseId/editor` stays a route of its own; it takes a
 * path parameter and is a screen you go INTO from a section, not a section.
 *
 * The section screens themselves are unchanged, and each still receives its
 * capability flags from here — the route is the only place holding the
 * router's permissions.
 */
export const Route = createFileRoute('/_authed/admin/')({
  validateSearch: adminSearchSchema,
  /**
   * The section a bare `/admin` resolves to, matching what `adminSectionParser`
   * gives the component for the same URL. The two parsers exist because the
   * router and nuqs each need their own: nuqs owns the value in the component,
   * this owns it in `beforeLoad`, `loaderDeps` and in every typed `<Link>`.
   */
  loaderDeps: ({ search }) => ({
    section: search.section ?? DEFAULT_ADMIN_SECTION,
  }),
  /**
   * A section reachable by typing its URL that the nav withholds would be the
   * mirror image of the dead-end link this shell already refuses to render —
   * so the same `adminSectionGates` call decides both.
   *
   * Gated here rather than in the component so nobody sees a flash of a screen
   * they cannot use. It decides ENTRY only: every read and write behind each
   * section goes through its own server-side guard, which is what actually
   * enforces this.
   */
  beforeLoad: ({ context, search }) => {
    // A bare `/admin` is normalised to the default section rather than left
    // implicit. All four sections share one pathname, so `?section=` is the
    // only thing that tells the nav which one you are on — and its match is a
    // SUBSET test, in which an empty search is contained in every URL. Left
    // bare, the knowledge library's link would read as active on all four.
    if (!search.section) {
      throw redirect({
        to: '/admin',
        search: { section: DEFAULT_ADMIN_SECTION },
      });
    }
    // The default section can never be the one refused — `/admin`'s own guard
    // admits exactly the actors it admits — but the check is written so that
    // a refusal cannot redirect to itself even if that ever stopped being
    // true.
    if (search.section === DEFAULT_ADMIN_SECTION) return;
    if (!adminSectionGates(context)[search.section]) {
      throw redirect({
        to: '/admin',
        search: { section: DEFAULT_ADMIN_SECTION },
      });
    }
  },
  /**
   * Primes the users list — **in the browser only**, and only for the section
   * that reads it.
   *
   * With the router's `defaultPreload: 'intent'` this runs when the People nav
   * link is HOVERED, so by the time the click lands the request is usually
   * already in flight. That is a client-side navigation concern: on the server
   * the page is being rendered anyway, so there is no navigation to make feel
   * faster, and nothing to gain.
   *
   * The guard is not an optimisation, it is a correctness fix. Loaders run on
   * BOTH sides, and this query's `queryFn` does `fetch('/api/admin/users')` —
   * a relative URL, which the browser resolves against the current origin and
   * Node cannot resolve at all (`TypeError: Failed to parse URL`). Primed
   * during SSR it therefore threw, and because the call is deliberately not
   * awaited that surfaced as an unhandled rejection plus a REJECTED entry
   * sitting in the query cache for the SSR-Query integration to dehydrate —
   * which hung the page rather than failing it cleanly.
   *
   * Not awaited either way: blocking the navigation would trade a fast screen
   * with a skeleton for a slow one with nothing on it.
   *
   * `ensureQueryData`, not `fetchQuery`: an entry already inside `staleTime`
   * is reused rather than refetched, so hovering the link repeatedly is free.
   */
  loader: ({ context, deps }) => {
    if (typeof window === 'undefined') return;
    if (deps.section !== 'people') return;
    void context.queryClient.ensureQueryData(adminUsersQueryOptions());
  },
  component: AdminSectionScreen,
});

function AdminSectionScreen() {
  const { roles, permissions, isStaffAnywhere, isCourseManagerAnywhere } =
    Route.useRouteContext();
  // nuqs owns the value in the component — same URL, same parser fallback as
  // `beforeLoad`'s, so the screen that renders is always the one that was
  // admitted.
  const [section] = useQueryState('section', adminSectionParser);

  if (section === 'courses') return <CoursesSectionContainer />;

  if (section === 'schedule') {
    return (
      <SchedulePageContainer
        // The same union the API's write guard uses (`requireCourseCreation`,
        // RBAC rule 5): a course manager or an admin. Read here because the
        // route is the only place holding permissions — and passed down rather
        // than re-derived, so the rail's copy and the server's answer cannot
        // disagree.
        canSchedule={
          hasOrgPermission(roles, permissions, 'course', 'create') ||
          isCourseManagerAnywhere
        }
      />
    );
  }

  if (section === 'people') {
    return <UsersPageContainer roles={roles} permissions={permissions} />;
  }

  /**
   * The knowledge library editor: every lesson the org owns on the left, every
   * course it runs on the right. This is the **composing** surface — link a
   * lesson into a course, move it between modules, reorder, remove. What a
   * lesson IS (video, material, quiz, gates) is edited on the per-course
   * configure surface at `/admin/$courseId/editor`, reached from each course
   * column's "Configure" link.
   *
   * Takes NO course parameter, deliberately. A lesson belongs to the org and
   * can be taught by several courses at once, so there is no course to scope
   * the screen to — see `/api/admin/editor`, whose own doc comment explains
   * why that route refuses a course filter too.
   *
   * The default, and the fallthrough: an unrecognised `?section=` resolves
   * here through the parser rather than rendering nothing.
   *
   * Three capability flags, all org-level questions the context can actually
   * answer, each mirroring the guard on the endpoint behind it (RBAC rules 1,
   * 3 and 5). Nothing else is threaded: authority over deleting a LESSON
   * follows the lesson's discipline (`requireLessonContentPermission`), which
   * global roles and permissions cannot answer for any particular lesson. The
   * card offers the control, the server refuses it if it must, and
   * `useDeleteLesson` turns that 403 into a sentence saying so.
   */
  return (
    <EditorContainer
      capabilities={{
        // RBAC rule 1 — a course manager, a subject expert or an admin may
        // CREATE a discipline. Mirrors `requireDisciplineCreation`, which is
        // the guard form of this same union.
        canCreateDiscipline: hasAdminAccess(roles) || isStaffAnywhere,
        // Rule 3 — renaming and deleting a discipline stay admin-only, as does
        // appointing its experts. Naming a new subject is cheap and reversible
        // by its author; handing out authority over one is not, and letting an
        // SME do it would make expert assignment self-propagating.
        canManageDisciplines: hasAdminAccess(roles),
        // Rule 5 — a course manager or an admin may create a new offering. A
        // subject expert is deliberately absent: they author lessons, they do
        // not decide which courses the org sells. Mirrors
        // `requireCourseCreation`.
        canCreateCourse:
          hasOrgPermission(roles, permissions, 'course', 'create') ||
          isCourseManagerAnywhere,
        // Editing and deleting a course are org-level and admin-floored — no
        // course-manager union, unlike creation above: rule 5 named course
        // managers for creating offerings and nothing else.
        canEditCourse: hasOrgPermission(roles, permissions, 'course', 'update'),
        canDeleteCourse: hasOrgPermission(
          roles,
          permissions,
          'course',
          'delete',
        ),
      }}
    />
  );
}
