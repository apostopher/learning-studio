import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Where the knowledge library used to live. It is a section of `/admin` now
 * (`?section=knowledge-library`, and the default, so a bare `/admin` opens on
 * it) — this route stays only so links and bookmarks made while it was a page
 * of its own still land where they meant to.
 */
export const Route = createFileRoute('/_authed/admin/editor')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { section: 'knowledge-library' } });
  },
});
