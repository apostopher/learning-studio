import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { chatWidgetModeAtom, chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { useOnboardingStatus } from '#/data-hooks/use-onboarding-status';
import { shouldAutoOpenOnboarding } from '#/lib/onboarding-auto-open';
import { getMySubscribedSlugs } from '@/lib/course-functions';
import { AppShell } from '../../components/app-shell';
import { AppShellFooter } from '../../components/app-shell-footer';
import { AppShellSkeleton } from '../../components/app-shell-skeleton';
import { LessonHeaderWrapper } from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';

export const Route = createFileRoute('/_authed/course/$courseSlug')({
  beforeLoad: async ({ params }) => {
    const slugs = await getMySubscribedSlugs();
    if (!slugs.includes(params.courseSlug)) {
      // Redirect (not notFound()) for three reasons:
      // 1. `admin.tsx` already establishes redirect-to-`/app` as this
      //    codebase's "you may not view this" behaviour — follow it rather
      //    than introducing a second idiom.
      // 2. There is no `notFoundComponent` anywhere in this repo, so
      //    `notFound()` would render an unstyled framework default.
      // 3. Redirecting *both* the bogus-slug and the not-enrolled case to
      //    the same place avoids leaking which slugs are real courses.
      //    Distinguishing them would let someone enumerate the catalogue.
      throw redirect({ to: '/app' });
    }
  },
  component: CourseLayout,
  // Without a pendingComponent the router never starts its pending timer and
  // leaves the PREVIOUS page mounted for the whole of beforeLoad — which is
  // why clicking a course card used to look like nothing happened.
  // 120ms is below the ~200ms threshold where a click starts to feel ignored,
  // but above one frame, so a cache-warm navigation skips the skeleton
  // entirely. pendingMinMs keeps it up long enough to read as progress
  // rather than a flicker.
  pendingComponent: AppShellSkeleton,
  pendingMs: 120,
  pendingMinMs: 400,
});

/**
 * Auto-opens the shared chat widget into onboarding mode when the learner has
 * a resumable onboarding session for this course — never started, or started
 * and interrupted (an error, a timeout, just closing the widget) short of an
 * explicit decline, completion, or deletion. See shouldAutoOpenOnboarding for
 * the exact status logic.
 *
 * Lives on the LAYOUT, not on the course index, because the index is now a
 * pure redirector whose component never mounts — leaving this there would have
 * silently disabled the feature. The layout is the true "entered this course"
 * boundary: it mounts on arrival and stays mounted while the learner moves
 * between lessons, so this fires once per course visit, the same cadence as
 * before. It also now covers a case the index never did — arriving directly at
 * a bookmarked lesson URL.
 *
 * useOnboardingStatus is read-only (no model call) but fetches fresh on every
 * mount (staleTime: 0, refetchOnMount: 'always') rather than trusting the
 * cache — this decision is consequential enough (it can reopen the widget)
 * that a stale cached 'not_started' served synchronously is not an acceptable
 * source of truth. `hasCheckedRef` gates the decision so it only runs once
 * this mount's own fetch has settled; until then the effect does nothing.
 */
function useAutoOpenOnboarding(courseSlug: string) {
  const query = useOnboardingStatus(courseSlug);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const setOpen = useSetAtom(chatWidgetOpenAtom);
  const isWidgetOpen = useAtomValue(chatWidgetOpenAtom);
  const widgetMode = useAtomValue(chatWidgetModeAtom);

  // Whether this visit has already made its auto-open decision (acted or
  // correctly declined to). Reset on courseSlug change because this layout is
  // REUSED, not remounted, when navigating between two courses.
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
}

function CourseLayout() {
  const { courseSlug } = Route.useParams();
  useAutoOpenOnboarding(courseSlug);
  // Loose read: these two params belong to the deeper lesson route, not this
  // layout's own path. Their presence is how the layout knows which leaf is
  // active — the same idiom CourseSidebarWrapper already uses for the same
  // two params. This only needs to distinguish two leaf shapes (course home
  // vs. a lesson); if a third leaf ever needs its own headerMain content,
  // revisit this rather than extending the presence check further.
  //
  // headerMain is rendered here (rather than by the lesson leaf itself)
  // because AppShell places it in a fixed grid row while `main` sits inside
  // a ScrollArea — a header rendered by the leaf would scroll away with the
  // lesson body instead of staying pinned.
  const { moduleSlug, lessonSlug } = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };

  return (
    <AppShell
      headerMain={
        moduleSlug != null && lessonSlug != null ? (
          <LessonHeaderWrapper
            courseSlug={courseSlug}
            moduleSlug={moduleSlug}
            lessonSlug={lessonSlug}
          />
        ) : undefined
      }
      aside={<CourseSidebarWrapper courseSlug={courseSlug} />}
      main={<Outlet />}
      footer={<AppShellFooter />}
    />
  );
}
