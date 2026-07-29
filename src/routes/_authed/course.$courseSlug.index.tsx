import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { chatWidgetModeAtom, chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { useOnboardingStatus } from '#/data-hooks/use-onboarding-status';
import { shouldAutoOpenOnboarding } from '#/lib/onboarding-auto-open';
import { LessonEmpty } from '../../components/lesson-main';

/**
 * Container: auto-opens the shared chat widget into onboarding mode when the
 * learner has never engaged with onboarding for this course.
 *
 * useOnboardingStatus is read-only (no model call) but now fetches fresh on
 * every mount (staleTime: 0, refetchOnMount: 'always') rather than trusting
 * the cache — this decision is consequential enough (it can reopen the
 * widget) that a stale cached `'not_started'` served synchronously on remount
 * is not an acceptable source of truth. `hasCheckedRef` gates the actual
 * decision so it only runs once this mount's own fetch has settled (see the
 * effect below); until then the effect simply does nothing, so a fresh page
 * visit re-evaluates against real data and a mid-visit re-render never
 * re-fires once it's already decided.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: CourseIndexContainer,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const query = useOnboardingStatus(courseSlug);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const setOpen = useSetAtom(chatWidgetOpenAtom);
  const isWidgetOpen = useAtomValue(chatWidgetOpenAtom);
  const widgetMode = useAtomValue(chatWidgetModeAtom);

  // Whether this visit has already made its auto-open decision (acted or
  // correctly declined to). Reset on courseSlug change so navigating to a
  // different course's page re-evaluates fresh.
  const hasCheckedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: courseSlug intentionally re-triggers the reset on course switch even though it isn't read in the body.
  useEffect(() => {
    hasCheckedRef.current = false;
  }, [courseSlug]);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    // Don't act on a value from before THIS mount's own fetch resolved: with
    // refetchOnMount: 'always', a fetch is guaranteed to be in flight, so
    // waiting for it to finish (isFetched) and not be in flight (!isFetching)
    // means `query.data` reflects this visit, never a leftover cached value
    // from before the learner declined/deleted/paused elsewhere.
    if (query.isFetching || !query.isFetched) return;

    hasCheckedRef.current = true;

    // A query error (isFetched still becomes true, data stays undefined) is
    // deliberately treated as "don't auto-open" — fail closed rather than
    // risk reopening the widget on bad information.
    if (
      shouldAutoOpenOnboarding({
        status: query.data,
        isWidgetOpen,
        widgetMode,
      })
    ) {
      setMode({ kind: 'onboarding', courseSlug });
      setOpen(true);
    }
  }, [
    query.isFetching,
    query.isFetched,
    query.data,
    isWidgetOpen,
    widgetMode,
    courseSlug,
    setMode,
    setOpen,
  ]);

  return <LessonEmpty />;
}
