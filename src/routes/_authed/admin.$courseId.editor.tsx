import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The per-course module board used to live here. It is now one pane of the
 * org-level knowledge library editor, which shows every course at once, so
 * this URL has nothing course-specific left to render.
 *
 * Kept as a redirect rather than deleted: `/admin` still links here from every
 * course tile, and anyone who bookmarked a course's editor should land
 * somewhere useful rather than on a 404. The `courseId` is deliberately
 * dropped — the destination is org-wide and takes no course.
 *
 * `beforeLoad`, not the component: redirecting during the load phase means the
 * old board's route never renders, so there is no flash of a screen that no
 * longer exists.
 */
export const Route = createFileRoute('/_authed/admin/$courseId/editor')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/editor' });
  },
});
