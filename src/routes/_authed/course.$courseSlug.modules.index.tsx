import { createFileRoute } from '@tanstack/react-router';
import { resumeCourseOrExplain } from '#/lib/course-resume-redirect';
import { LessonEmpty, LessonSkeleton } from '../../components/lesson-main';

/**
 * Modules is not a page — it is the way back into the course.
 *
 * It resolves to the lesson the learner was last on, via the same
 * `resumeCourseOrExplain` that `/course/$courseSlug` uses, so arriving through
 * the nav and arriving through a course card cannot land in different places.
 *
 * `modules.index.tsx`, NOT `modules.tsx`. A flat `modules.tsx` would become the
 * PARENT of `course.$courseSlug.modules.$moduleSlug.lessons.$lessonSlug.tsx`,
 * so every lesson would render inside this route — and a redirector has no
 * `<Outlet/>`, so lesson pages would vanish entirely while typecheck and tests
 * stayed green. An index route claims `/modules` without owning what is under
 * it. (It also gives the nav item the right active state for free: `/modules`
 * is a path prefix of every lesson URL, so Modules highlights while a lesson
 * is open, which is exactly where the learner is.)
 *
 * The component below is reached only when there is genuinely nowhere to send
 * the learner — no published lessons, or every one still locked.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/modules/')({
  beforeLoad: ({ context, params }) =>
    resumeCourseOrExplain({
      queryClient: context.queryClient,
      courseSlug: params.courseSlug,
    }),
  component: ModulesIndexContainer,
  // LessonSkeleton alone, with no AppShell wrapper: by the time this route is
  // pending its parent layout has committed and is already supplying the
  // shell. Rendering another would nest two shells.
  pendingComponent: LessonSkeleton,
  pendingMs: 120,
  pendingMinMs: 400,
});

function ModulesIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { resume } = Route.useRouteContext();
  return <LessonEmpty courseSlug={courseSlug} state={resume} />;
}
