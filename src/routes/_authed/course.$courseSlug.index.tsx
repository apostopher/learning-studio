import { createFileRoute } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { chatWidgetModeAtom, chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { useOnboardingStatus } from '#/data-hooks/use-onboarding-status';
import { LessonEmpty } from '../../components/lesson-main';

/**
 * Container: auto-opens the shared chat widget into onboarding mode when the
 * learner has never engaged with onboarding for this course.
 *
 * useOnboardingStatus is read-only (no model call, safe on every render); the
 * effect only fires when its `status` dependency's VALUE changes, so closing
 * the widget mid-visit without responding does not reopen it on an unrelated
 * re-render (status is still 'not_started', same value, effect doesn't
 * re-run) — but a fresh page visit (component remount) re-evaluates and
 * reopens if still 'not_started'. No dismissal state is tracked by design.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: CourseIndexContainer,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { data: status } = useOnboardingStatus(courseSlug);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const setOpen = useSetAtom(chatWidgetOpenAtom);

  useEffect(() => {
    if (status === 'not_started') {
      setMode({ kind: 'onboarding', courseSlug });
      setOpen(true);
    }
  }, [status, courseSlug, setMode, setOpen]);

  return <LessonEmpty />;
}
