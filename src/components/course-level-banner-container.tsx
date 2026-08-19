import { useParams } from '@tanstack/react-router';
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
 */
export const CourseLevelBannerContainer = () => {
  const { courseSlug } = useParams({ strict: false }) as {
    courseSlug?: string;
  };

  // Off a course route entirely (e.g. /app, /admin): nothing to show. The
  // bare, childless AlertBar stays aria-hidden, matching every other
  // non-course screen today.
  if (!courseSlug) return <AlertBar />;

  return <CourseLevelBannerForCourse courseSlug={courseSlug} />;
};
