import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { courseResumeQueryOptions } from '#/data-hooks/course-access-queries';
import type { ResumeTarget } from '#/lib/course-resume';

/**
 * The only outcomes that RETURN. A resolvable lesson leaves via `throw
 * redirect`, so it can never reach a caller — narrowing the return type says
 * that in the type system rather than in a comment, and is what lets
 * `LessonEmpty` take the result directly without a redundant `kind` check the
 * compiler would never be able to prove unreachable.
 */
export type ResumeNowhere = Extract<ResumeTarget, { kind: 'none' }>;

/**
 * Send a learner to wherever they left off in this course, or hand back the
 * reason there is nowhere to send them.
 *
 * Two routes need this and they must not drift: `/course/$courseSlug` (the
 * bare course URL, e.g. from a course card) and `/course/$courseSlug/modules`
 * (the header nav's Modules item). If they ever disagreed, the same learner
 * would land in different places depending on which door they came through.
 *
 * Called from `beforeLoad`, which on a cold load runs on the SERVER — that is
 * why the resume pointer lives in Postgres rather than localStorage, and why
 * neither the empty state nor the onboarding widget can flash on a page that
 * is about to navigate away.
 *
 * `replace: true` keeps the intermediate URL out of history, so Back from the
 * lesson returns to whatever the learner was looking at before, rather than
 * bouncing forward through the redirect again.
 *
 * See docs/superpowers/specs/2026-07-30-course-resume-redirect-ledger.md.
 */
export async function resumeCourseOrExplain({
  queryClient,
  courseSlug,
}: {
  queryClient: QueryClient;
  courseSlug: string;
}): Promise<{ resume: ResumeNowhere }> {
  const resume = await queryClient.ensureQueryData(
    courseResumeQueryOptions(courseSlug),
  );

  if (resume.kind === 'lesson') {
    throw redirect({
      to: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
      params: {
        courseSlug,
        moduleSlug: resume.moduleSlug,
        lessonSlug: resume.lessonSlug,
      },
      replace: true,
    });
  }

  return { resume };
}
