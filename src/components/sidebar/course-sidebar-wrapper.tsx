import { useParams } from '@tanstack/react-router';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useCourseProgressSummary } from '#/data-hooks/use-course-progress-summary';
import { useMyLevel } from '#/data-hooks/use-my-level';
import { courseDetailsAtomFamily } from '#/hooks/data/use-course-details';
import { msUntil } from '#/lib/debrief-schedule';
import { LEVEL_LABELS } from '#/lib/level-labels';
import {
  courseHasAvailableLessons,
  filterCourseToLevel,
} from '#/lib/level-visibility';
import {
  archiveSectionOpenAtom,
  openModuleSlugAtom,
} from '../../atoms/sidebar';
import { computeArchivedLessons } from './compute-archived-lessons';
import { computeLessonLocks } from './compute-lesson-locks';
import {
  computeSidebarPercents,
  earliestRefreshAt,
} from './compute-sidebar-percents';
import { CourseSidebar } from './course-sidebar';

/**
 * Bumped by the refresh timer to recompute the rings against a fresh clock.
 * A counter, not a Date: a module-level `new Date()` would be frozen at server
 * start and could be hours stale.
 */
const sidebarTickAtom = atom(0);

/** Flips true once the client has mounted; see `mounted` in the container. */
const sidebarMountedAtom = atom(false);

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type CourseSidebarWrapperProps = {
  courseSlug: string;
};

export const CourseSidebarWrapper = ({
  courseSlug,
}: CourseSidebarWrapperProps) => {
  const params = useParams({ strict: false }) as {
    lessonSlug?: string;
  };
  const detailsQuery = useAtomValue(courseDetailsAtomFamily(courseSlug));
  const progressQuery = useCourseProgressSummary(courseSlug);
  const levelQuery = useMyLevel(courseSlug);
  // From the SERVER, not from the viewer's roles. `useIsAdmin` answers "am I
  // an admin"; the question here is "am I looking at a course I author", and
  // for a `subject-expert`/`course-manager` those differ — they author one
  // course and are an ordinary gated learner in every other. The route that
  // built this payload already decided (see `viewingAsAuthor` in
  // `course-details-shape.ts`), so the sidebar cannot disagree with the gate
  // the server just applied. Absent (still loading, or an error) reads as
  // false: a learner's tree is the safe thing to draw while we do not know.
  const viewingAsAuthor = detailsQuery.data?.viewingAsAuthor ?? false;
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);
  const [archiveSectionOpen, setArchiveSectionOpen] = useAtom(
    archiveSectionOpenAtom,
  );

  // Filter to what this pilot's level may see, before anything downstream
  // (percent maps, lock computation, module/lesson counts) reads the course
  // tree — so a hidden lesson never appears as the blocker in a lock reason
  // the pilot cannot act on, and never surfaces anywhere else in the sidebar.
  // An author bypasses the filter, matching evaluateLessonGate's own
  // short-circuit for the same viewer. Until the level query resolves, this stays undefined
  // rather than falling back to the unfiltered payload — computeLessonLocks
  // and `derived` below already treat "no details yet" as "still loading", so
  // nothing unfiltered is ever handed to them, even transiently.
  const visibleDetails = useMemo(() => {
    if (!detailsQuery.data) return detailsQuery.data;
    if (viewingAsAuthor) return detailsQuery.data;
    if (!levelQuery.data) return undefined;
    return filterCourseToLevel(detailsQuery.data, levelQuery.data.level);
  }, [detailsQuery.data, levelQuery.data, viewingAsAuthor]);

  // Not an author, and course details have arrived, but the level query hasn't
  // settled (and hasn't errored) yet — visibleDetails is intentionally
  // undefined in this window; treat the sidebar as still loading rather than
  // erroring or showing anything unfiltered.
  const levelPending =
    !viewingAsAuthor &&
    !!detailsQuery.data &&
    !levelQuery.data &&
    !levelQuery.isError;

  // Server-aggregated progress → the slug-keyed / moduleId-keyed maps the
  // sidebar renders. Replaces the old client-side jotai aggregation.
  //
  // CourseProgress.lessons[] carries lessonId, not a slug or a videoId — it
  // never has, and no longer even has a videoId to fall back on. This map is
  // built by joining progress rows to course details' lessonId → slug, so the
  // percent LessonList looks up under `lesson.slug` actually matches the
  // lesson it's rendering, rather than colliding on an unrelated key space.
  //
  // The module and course percentages are RECOMPUTED here rather than taken
  // from `progress.modules` / `progress.percent`, because `getCourseProgress`
  // is not level-aware: it averages over every lesson in the course, while
  // this sidebar renders only the ones `visibleDetails` kept. Left as-is, a
  // module showing 3 lessons draws a ring computed over 8, and a pilot set
  // straight to Advanced has a course ring permanently capped by Basic lessons
  // they can never open.
  //
  // Module% is the mean of its visible lessons' percents (debriefs excluded);
  // course% is `coursePercent` over the visible lessons, which also counts one
  // item per debrief-bearing lesson. See computeSidebarPercents.
  const tick = useAtomValue(sidebarTickAtom);
  const bumpTick = useSetAtom(sidebarTickAtom);
  // False on the server and during hydration, true after. The ring's
  // accessible name carries a clock time in the viewer's timezone, which the
  // server cannot know; rendering "later" until mounted keeps the first client
  // render identical to the server HTML (the same guarantee as ClientGate, via an effect).
  const [mounted, setMounted] = useAtom(sidebarMountedAtom);
  useEffect(() => {
    setMounted(true);
  }, [setMounted]);
  // `tick` is only a recompute trigger; the clock is read inside.
  const { lessonPercents, modulePercents, coursePercent, lessonRings } =
    // biome-ignore lint/correctness/useExhaustiveDependencies: tick forces a re-read of the clock
    useMemo(
      () =>
        computeSidebarPercents(visibleDetails, progressQuery.data, new Date(), {
          includeTime: mounted,
        }),
      [progressQuery.data, visibleDetails, tick, mounted],
    );

  // One timer, for the soonest instant any ring changes (a debrief opening),
  // so the D appears without a reload. Re-armed whenever the rings change,
  // cleared on unmount. `msUntil` clamps a past instant to 0, which would fire
  // at once; but then the recompute sees a clock past that instant, `refreshAt` moves on
  // or becomes null, and the effect does not loop.
  const refreshAt = useMemo(
    () => earliestRefreshAt(lessonRings),
    [lessonRings],
  );
  useEffect(() => {
    if (refreshAt === null) return;
    const id = setTimeout(
      () => bumpTick((n) => n + 1),
      msUntil(refreshAt, new Date()),
    );
    return () => clearTimeout(id);
  }, [refreshAt, bumpTick]);

  // Computed client-side from the two queries above — never written back to
  // getCourseDetailsWithCache, whose Redis entry is shared across every
  // student. Resolves to {} until both queries have data, so a half-loaded
  // sidebar never shows a lock nobody can yet explain, and to {} for an
  // author, whose rows all open regardless of what the predicate says.
  const lessonLocks = useMemo(
    () =>
      computeLessonLocks(
        visibleDetails ?? undefined,
        progressQuery.data,
        viewingAsAuthor,
      ),
    [visibleDetails, progressQuery.data, viewingAsAuthor],
  );

  // Completed-at-an-earlier-level lessons the main (filtered) tree no longer
  // shows — the sidebar's own archive index. Deliberately built from
  // `detailsQuery.data` (the UNFILTERED tree), not `visibleDetails`: the
  // whole point is lessons that filtering just removed. Empty for an author
  // (nothing is ever "out of tier" for them — see visibleDetails above) and
  // while the level query hasn't resolved yet, so this can never show a
  // lesson under the wrong level's rule for a moment.
  const archivedLessons = useMemo(() => {
    if (viewingAsAuthor || !levelQuery.data) return [];
    return computeArchivedLessons(
      detailsQuery.data,
      progressQuery.data,
      levelQuery.data.level,
    );
  }, [detailsQuery.data, progressQuery.data, levelQuery.data, viewingAsAuthor]);

  const derived = useMemo(() => {
    if (detailsQuery.isLoading || levelPending)
      return { status: 'loading' as const };
    if (detailsQuery.isError || visibleDetails == null)
      return { status: 'error' as const };
    const data = visibleDetails;
    const modules = data.modules as unknown as readonly ModuleLike[];
    const moduleCount = modules.length;
    const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
    // Strict levels can leave a learner's tree empty for two reasons, and the
    // sidebar says which rather than drawing an empty list. An author's tree
    // is never level-filtered, so it never gets one; nor does a course with
    // no lessons at all, which is empty for everyone and says so elsewhere.
    // The UNFILTERED payload: the question is whether the course has lessons
    // at all, not whether this pilot can see any.
    const courseHasLessons =
      detailsQuery.data != null && courseHasAvailableLessons(detailsQuery.data);
    const emptyReason =
      viewingAsAuthor || moduleCount > 0 || !levelQuery.data
        ? null
        : levelQuery.data.level === null
          ? ('no-level' as const)
          : courseHasLessons
            ? ('no-lessons-at-level' as const)
            : null;
    return {
      status: 'ready' as const,
      title: data.name,
      moduleCount,
      lessonCount,
      modules,
      emptyReason,
    };
  }, [
    visibleDetails,
    detailsQuery.isError,
    detailsQuery.isLoading,
    levelPending,
    levelQuery.data,
    viewingAsAuthor,
    detailsQuery.data,
  ]);

  if (derived.status === 'loading' || derived.status === 'error') {
    return (
      <CourseSidebar
        courseSlug={courseSlug}
        status={derived.status}
        openModuleSlug={openModuleSlug}
        onOpenChange={setOpenModuleSlug}
        activeLessonSlug={null}
      />
    );
  }

  return (
    <CourseSidebar
      courseSlug={courseSlug}
      status="ready"
      title={derived.title}
      moduleCount={derived.moduleCount}
      lessonCount={derived.lessonCount}
      modules={derived.modules}
      openModuleSlug={openModuleSlug}
      onOpenChange={setOpenModuleSlug}
      activeLessonSlug={params.lessonSlug ?? null}
      lessonPercents={lessonPercents}
      modulePercents={modulePercents}
      coursePercent={coursePercent}
      lessonLocks={lessonLocks}
      lessonRings={lessonRings}
      level={
        viewingAsAuthor || !levelQuery.data || levelQuery.data.level === null
          ? null
          : LEVEL_LABELS[levelQuery.data.level]
      }
      emptyReason={derived.emptyReason}
      archivedLessons={archivedLessons}
      archiveSectionOpen={archiveSectionOpen}
      onArchiveSectionOpenChange={setArchiveSectionOpen}
    />
  );
};
