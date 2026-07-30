import { createFileRoute, redirect } from '@tanstack/react-router';
import { getCourseResumeTarget } from '#/lib/course-resume-functions';
import { LessonEmpty } from '../../components/lesson-main';

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
  beforeLoad: async ({ params }) => {
    const resume = await getCourseResumeTarget({
      data: { courseSlug: params.courseSlug },
    });

    if (resume.kind === 'lesson') {
      throw redirect({
        to: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
        params: {
          courseSlug: params.courseSlug,
          moduleSlug: resume.moduleSlug,
          lessonSlug: resume.lessonSlug,
        },
        replace: true,
      });
    }

    return { resume };
  },
  component: CourseIndexContainer,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { resume } = Route.useRouteContext();
  return <LessonEmpty courseSlug={courseSlug} state={resume} />;
}
