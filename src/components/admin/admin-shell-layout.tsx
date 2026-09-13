import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { AdminSectionId } from '#/lib/admin-sections';
import { AppHeaderContainer } from '../app-header-container';

/**
 * Chrome shared by every `/admin` screen: the app header (logo home + sign
 * out) above the section nav.
 *
 * The sections arrive already filtered and in order — see `adminSectionGates`,
 * whose result also decides which sections may be entered by URL, so a link
 * offered here and a screen that admits you are the same decision. When none
 * survives, the bar says so rather than sitting there empty.
 *
 * Fully presentational apart from the header container it mounts: the
 * permission read stays in the route, which is the only place that can perform
 * it.
 */
export const AdminShellLayout = ({
  sections,
  children,
}: {
  /** The sections to offer, in nav order. */
  sections: readonly { id: AdminSectionId; label: string }[];
  children: ReactNode;
}) => (
  // The whole layout is capped to the viewport so a full-height child (the
  // course editor board) can size against it exactly, instead of assuming it
  // owns the viewport itself. `min-h-0` on the children slot lets it shrink
  // below its content's natural height — required for a flex child to size
  // correctly — while ordinary scrolling sections (schedule, people) are
  // unaffected: with no `flex-1`/height of their own they still take their
  // natural content height and overflow the slot normally, which bubbles up to
  // a regular page-level scrollbar rather than being clipped.
  <div className="flex h-dvh flex-col">
    <AppHeaderContainer />
    <nav
      aria-label="Admin sections"
      // Edge to edge on the same 1rem rail as the header above and the
      // editor's own column gutters below — see `AppHeader` for why the
      // chrome stopped using `content-grid`.
      className="border-gray-6 border-b bg-gray-2"
    >
      <div className="flex gap-1 px-4 py-2">
        {sections.map((section) => (
          <AdminNavLink key={section.id} section={section.id}>
            {section.label}
          </AdminNavLink>
        ))}
        {sections.length === 0 && (
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
  section,
  children,
}: {
  section: AdminSectionId;
  children: ReactNode;
}) => (
  <Link
    to="/admin"
    /**
     * Every link names its section, the default one included — which is why
     * the screen normalises a bare `/admin` into `?section=knowledge-library`
     * rather than treating the default as the parameter's absence.
     *
     * That is not cosmetic. All four sections share one pathname, so the only
     * thing telling `Link` which of them you are on is the search parameter,
     * and its match is a SUBSET test: an empty search is contained in every
     * URL, so a default section spelled as `{}` would light up on all four.
     *
     * Each link replaces the whole query string rather than merging into it.
     * Sections keep their own state in the same place (People alone owns `q`,
     * `tab`, `course` and `level`), and carrying one section's filters into
     * the next would leave a URL claiming state that nothing on screen reads.
     */
    search={{ section }}
    // A cross-fade between admin sections, via the browser's own
    // `startViewTransition` (TanStack Router calls it; React's
    // `<ViewTransition>` is canary-only and this app is on stable 19.2).
    //
    // A FADE, not a directional slide. These sections are lateral — no one of
    // them is "deeper" than another — and a slide would imply a spatial
    // relationship that does not exist. Slides are for list-to-detail.
    //
    // Per-link rather than `defaultViewTransition` on the router, so it
    // applies where it means something instead of to every navigation in the
    // app, including redirects and back-button restores.
    viewTransition
    preload="intent"
    /**
     * `exact`, so `/admin/$courseId/editor` cannot prefix-match this shell's
     * own path and light a section up. That board is a screen you go INTO from
     * the knowledge library, not a section, and marking one there would name a
     * place you are not.
     *
     * The active state is `Link`'s own, which is also what puts
     * `aria-current="page"` on the link — the highlight is the only thing
     * saying which section you are in, and it has to be said out loud too.
     */
    activeOptions={{ exact: true }}
    className="rounded-lg px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-[status=active]:bg-gray-4 data-[status=active]:text-primary"
  >
    {children}
  </Link>
);
