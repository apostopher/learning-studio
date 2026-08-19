import { useParams } from '@tanstack/react-router';
import { useIsAdmin } from '#/hooks/use-is-admin';
import { AlertBar } from './alert-bar';
import { CourseLevelBannerForCourse } from './course-level-banner-for-course';

/**
 * Mounted once, globally, in `src/routes/_authed.tsx` in place of the bare
 * `<AlertBar />` — the seam `AlertBar`'s own doc comment calls out (it
 * already renders `children`; nothing was mounting any).
 *
 * `useParams({ strict: false })` reads whatever route is currently matched
 * without requiring this component to live under a specific route — the same
 * idiom `CourseSidebarWrapper` and `useChatWidget` already use for the same
 * problem. Split from `CourseLevelBannerForCourse` so the actual data-fetching
 * (useMyLevel/useAcknowledgeLevelChange) only has to be given a `courseSlug`,
 * not extract it from routing itself — that split is also what keeps that
 * half testable without standing up a full router.
 *
 * `useIsAdmin` lives HERE, not in `CourseLevelBannerForCourse`, for the same
 * testability reason: it reads router context, and this is the router-aware
 * half. An admin never sees the banner, matching the level badge in the
 * sidebar (`course-sidebar-wrapper.tsx`) — "an admin's own row carries no
 * meaning" applies just as much to a change notice about that row as it does
 * to displaying the row's value.
 */
export const CourseLevelBannerContainer = () => {
  const { courseSlug } = useParams({ strict: false }) as {
    courseSlug?: string;
  };
  const isAdmin = useIsAdmin();

  // Off a course route entirely (e.g. /app, /admin), or an admin (who has no
  // meaningful level to be notified about): nothing to show. The bare,
  // childless AlertBar stays aria-hidden, matching every other case today.
  if (!courseSlug || isAdmin) return <AlertBar />;

  return <CourseLevelBannerForCourse courseSlug={courseSlug} />;
};
