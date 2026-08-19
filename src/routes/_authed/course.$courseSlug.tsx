import { useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { chatWidgetModeAtom, chatWidgetOpenAtom } from '#/atoms/chat-widget';
import { outOfTierNoticeAtom } from '#/atoms/out-of-tier-notice';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { subscribedSlugsQueryOptions } from '#/data-hooks/course-access-queries';
import { dataKeys } from '#/data-hooks/keys';
import { useOnboardingStatus } from '#/data-hooks/use-onboarding-status';
import { queryKeys } from '#/hooks/data/keys';
import { shouldAutoOpenOnboarding } from '#/lib/onboarding-auto-open';
import { AppShell } from '../../components/app-shell';
import { AppShellFooter } from '../../components/app-shell-footer';
import { AppShellSkeleton } from '../../components/app-shell-skeleton';
import { CourseHeaderNav } from '../../components/course-header-nav';
import { LessonHeaderWrapper } from '../../components/lesson-main';
import { LogoLink } from '../../components/logo-link';
import { OutOfTierNotice } from '../../components/out-of-tier-notice';
import { PromotionInterstitial } from '../../components/promotion-interstitial';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { SignOutButtonContainer } from '../../components/sign-out-button-container';

export const Route = createFileRoute('/_authed/course/$courseSlug')({
  beforeLoad: async ({ context, params }) => {
    const slugs = await context.queryClient.ensureQueryData(
      subscribedSlugsQueryOptions(),
    );
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

/**
 * Reads the pending promotion set by any of the four progress mutations
 * (section tap, video milestone, quiz submit, debrief save) and returns the
 * dismiss handler for the interstitial that announces it.
 *
 * Mounted once here, on the layout, rather than per-lesson: the layout stays
 * mounted across every lesson within a course visit, so a promotion earned on
 * one lesson is still announced even if the mutation that earned it belongs
 * to a component that has since unmounted (e.g. the tab that fired the
 * winning section tap).
 *
 * On dismiss: clear the atom, then invalidate both queries that visibility
 * depends on. `myLevel` drives the sidebar's level-gated lesson list;
 * `courseDetails` is the cached course tree itself. Invalidating only one
 * would leave the other showing the pre-promotion lesson set — exactly the
 * "my finished work vanished" read this dialog exists to prevent.
 */
function usePromotionInterstitial(courseSlug: string) {
  const promotion = useAtomValue(pendingPromotionAtom);
  const setPromotion = useSetAtom(pendingPromotionAtom);
  const queryClient = useQueryClient();

  const dismiss = useCallback(() => {
    setPromotion(null);
    queryClient.invalidateQueries({ queryKey: dataKeys.myLevel(courseSlug) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.courseDetails(courseSlug),
    });
  }, [courseSlug, queryClient, setPromotion]);

  return { promotion, dismiss };
}

/**
 * Reads the notice set right before a redirect away from a never-completed
 * out-of-tier lesson (see LessonMainWrapper). Mounted here, not on the lesson
 * leaf, because the redirect target's own beforeLoad
 * (`resumeCourseOrExplain`) can immediately redirect a second time — this
 * layout is the one thing guaranteed to still be mounted once that settles,
 * since `courseSlug` does not change across either hop.
 */
function useOutOfTierNotice() {
  const notice = useAtomValue(outOfTierNoticeAtom);
  const setNotice = useSetAtom(outOfTierNoticeAtom);
  const dismiss = useCallback(() => setNotice(null), [setNotice]);
  return { notice, dismiss };
}

function CourseLayout() {
  const { courseSlug } = Route.useParams();
  useAutoOpenOnboarding(courseSlug);
  const { promotion, dismiss } = usePromotionInterstitial(courseSlug);
  const { notice, dismiss: dismissOutOfTierNotice } = useOutOfTierNotice();
  // Loose read: these two params belong to the deeper lesson route, not this
  // layout's own path. Their presence is how the layout knows which leaf is
  // active — the same idiom CourseSidebarWrapper already uses for the same
  // two params.
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
    <>
      {/* Mounted once per course visit, not per lesson: see
          usePromotionInterstitial's doc comment above. */}
      <PromotionInterstitial promotion={promotion} onDismiss={dismiss} />
      <OutOfTierNotice notice={notice} onDismiss={dismissOutOfTierNotice} />
      <AppShell
        // The shell owns the viewport, so the logo goes in the header's aside
        // cell rather than in a second header above it. `ms-4` mirrors the
        // `pe-4` on headerMain so logo and sign-out sit at symmetric insets.
        // Margin rather than padding, and `w-fit` rather than filling the
        // cell: the aside cell clips overflow (`.app-shell__header-aside`),
        // so a link stretched to the full cell box has its focus ring painted
        // right at the clip edge (invisible) and a ~280px dead area beside the
        // logo that still navigates. Margin keeps the ring's box inset from
        // the clip boundary on every side, and `w-fit` shrinks the hit area to
        // the logo itself.
        headerAside={<LogoLink className="my-4 ms-4 flex w-fit items-center" />}
        // Always rendered now, because the nav sits at the trailing end on EVERY
        // leaf — including course home and the library, neither of which puts a
        // title here. The leaf's title stays in its own cell rather than beside
        // the nav, so LessonHeader's role="status" live region never wraps the
        // links and a loading announcement cannot swallow them.
        headerMain={
          <div className="flex h-full w-full items-center justify-between gap-4 pe-4">
            <div className="flex min-w-0 flex-1 items-center">
              {moduleSlug != null && lessonSlug != null ? (
                <LessonHeaderWrapper
                  courseSlug={courseSlug}
                  moduleSlug={moduleSlug}
                  lessonSlug={lessonSlug}
                />
              ) : null}
            </div>
            <CourseHeaderNav courseSlug={courseSlug} />
            {/* Trailing-most, after the section nav: sign-out is an exit from
              the whole app, not another destination within it, so it sits
              outside the nav landmark rather than reading as a fifth tab. */}
            <SignOutButtonContainer />
          </div>
        }
        aside={<CourseSidebarWrapper courseSlug={courseSlug} />}
        main={<Outlet />}
        footer={<AppShellFooter />}
      />
    </>
  );
}
