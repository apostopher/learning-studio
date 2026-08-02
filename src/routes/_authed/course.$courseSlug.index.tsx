import { createFileRoute } from '@tanstack/react-router';
import { resumeCourseOrExplain } from '#/lib/course-resume-redirect';
import { LessonEmpty, LessonSkeleton } from '../../components/lesson-main';

/**
 * `/course/$courseSlug` is a pure redirector, not a page. The sidebar
 * (CourseSidebarWrapper, rendered by the parent layout) already IS the course
 * overview — every module, lesson, progress bar and lock — so an index page
 * here would be a second, worse copy of what is permanently on screen.
 *
 * Resolving in `beforeLoad` rather than in an effect is what makes the
 * onboarding widget unable to flash on a doomed page: on a cold load this runs
 * on the server, so the redirect is decided before anything renders and this
 * component never mounts at all. (That is also why the resume pointer lives in
 * Postgres — `localStorage` does not exist here.)
 *
 * `replace: true` keeps the index out of history, so Back from a lesson goes
 * to `/app` instead of bouncing forward through the redirect again.
 *
 * The component below is reached only when there is genuinely nowhere to send
 * the learner. See docs/superpowers/specs/2026-07-30-course-resume-redirect-ledger.md.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  // Shared with `/course/$courseSlug/modules`, the header nav's Modules item —
  // both doors must land the learner in the same place.
  beforeLoad: ({ context, params }) =>
    resumeCourseOrExplain({
      queryClient: context.queryClient,
      courseSlug: params.courseSlug,
    }),
  component: CourseIndexContainer,
  // LessonSkeleton alone, with no AppShell wrapper: by the time this route is
  // pending its parent layout has committed and is already supplying the
  // shell. Rendering another would nest two shells.
  pendingComponent: LessonSkeleton,
  pendingMs: 120,
  pendingMinMs: 400,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { resume } = Route.useRouteContext();
  return <LessonEmpty courseSlug={courseSlug} state={resume} />;
}
