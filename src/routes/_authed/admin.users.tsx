import { createFileRoute, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { adminSearchSchema } from '#/lib/admin-sections';

/**
 * Where People used to live. It is a section of `/admin` now — this route
 * stays only so links and bookmarks made while it was a page of its own still
 * land where they meant to.
 *
 * The rest of the query string is carried across, which is the reason this
 * one validates its search at all: People keeps its search term, its open tab
 * and its two filters in the URL precisely so a link to, say, the permissions
 * tab is shareable. Dropping them here would break exactly the links this
 * redirect exists to honour.
 *
 * No `user:read` gate any more, and none needed: the section screen refuses an
 * actor People is closed to, from the same `adminSectionGates` call that
 * decides whether its nav link is offered.
 */
export const Route = createFileRoute('/_authed/admin/users')({
  validateSearch: adminSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/admin', search: { ...search, section: 'people' } });
  },
});
