import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AppHeaderContainer } from '../app-header-container';

/**
 * Chrome shared by every `/admin/*` screen: the app header (logo home + sign
 * out) above the section nav.
 *
 * Each link is gated on whether its destination has anything to show this
 * actor — not on holding one particular permission. Those differ: a subject
 * expert reaches the course index with no `course:read` at all, and an admin
 * with an empty grant set reaches neither section. Gating the nav as a whole
 * was the bug fixed in the previous task; the links are now independent, and
 * when neither survives, the bar says so rather than sitting there empty.
 *
 * Presentational apart from the header container it mounts — the permission
 * read stays in the route, which is the only place that can perform it.
 */
export const AdminShellLayout = ({
  canSeePeople,
  canSeeCourses,
  children,
}: {
  canSeePeople: boolean;
  canSeeCourses: boolean;
  children: ReactNode;
}) => (
  // The whole layout is now capped to the viewport so a full-height child
  // (the course editor board) can size against it exactly, instead of
  // assuming it owns the viewport itself. `min-h-0` on the children slot lets
  // it shrink below its content's natural height — required for a flex child
  // to size correctly — while ordinary scrolling pages (course list, people)
  // are unaffected: with no `flex-1`/height of their own they still take
  // their natural content height and overflow the slot normally, which
  // bubbles up to a regular page-level scrollbar rather than being clipped.
  <div className="flex h-dvh flex-col">
    <AppHeaderContainer />
    <nav
      aria-label="Admin sections"
      className="content-grid border-gray-6 border-b bg-gray-2"
    >
      <div className="content flex gap-1 py-2">
        {canSeeCourses && <AdminNavLink to="/admin">Courses</AdminNavLink>}
        {canSeePeople && <AdminNavLink to="/admin/users">People</AdminNavLink>}
        {!canSeeCourses && !canSeePeople && (
          // Not a bare strip: an actor with no section at all is told why,
          // in text a screen reader reaches like any other nav content.
          <p className="px-3 py-1.5 text-secondary text-sm">
            No admin sections are available with your current permissions.
          </p>
        )}
      </div>
    </nav>
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
  </div>
);

const AdminNavLink = ({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) => (
  <Link
    to={to}
    // `exact` on /admin only, so /admin/users doesn't light both links up.
    activeOptions={{ exact: to === '/admin' }}
    className="rounded-lg px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-[status=active]:bg-gray-4 data-[status=active]:text-primary"
  >
    {children}
  </Link>
);
