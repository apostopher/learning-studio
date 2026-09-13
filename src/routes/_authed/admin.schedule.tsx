import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Where the schedule board used to live. It is a section of `/admin` now —
 * this route stays only so links and bookmarks made while it was a page of its
 * own still land where they meant to.
 *
 * It carries no permission gate any more, and needs none: the section screen
 * refuses an actor the schedule is closed to, from the same
 * `adminSectionGates` call that decides whether its nav link is offered.
 */
export const Route = createFileRoute('/_authed/admin/schedule')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { section: 'schedule' } });
  },
});
