import { useParams } from '@tanstack/react-router';
import { useCourseDetails } from '#/hooks/data/use-course-details';
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
 * The author check lives HERE, not in `CourseLevelBannerForCourse`, for the
 * same testability reason: it needs the route's `courseSlug`, and this is the
 * router-aware half. Someone reading a course as its author never sees the
 * banner, matching the level badge in the sidebar
 * (`course-sidebar-wrapper.tsx`) — "an author's own row carries no meaning"
 * applies just as much to a change notice about that row as it does to
 * displaying the row's value.
 *
 * The answer comes from the course-details payload (`viewingAsAuthor`), not
 * from the viewer's roles: a `subject-expert` authors ONE course and is an
 * ordinary gated learner in every other, so a roles check would silence this
 * banner on courses where their level genuinely did change. Same query the
 * sidebar on this page already holds, so it costs no extra request.
 */
export const CourseLevelBannerContainer = () => {
  const { courseSlug } = useParams({ strict: false }) as {
    courseSlug?: string;
  };
  const detailsQuery = useCourseDetails(courseSlug);

  // Off a course route entirely (e.g. /app, /admin), or reading this course as
  // its author (no meaningful level to be notified about): nothing to show.
  // The bare, childless AlertBar stays aria-hidden, matching every other case
  // today. While the payload is still in flight the answer is unknown, and
  // announcing a level change to someone who turns out to be the author is
  // the wrong way to be wrong — so hold the bar until it lands.
  if (!courseSlug || !detailsQuery.data || detailsQuery.data.viewingAsAuthor) {
    return <AlertBar />;
  }

  return <CourseLevelBannerForCourse courseSlug={courseSlug} />;
};
