import { useParams } from '@tanstack/react-router';
import { useAtom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useCourseProgressSummary } from '#/data-hooks/use-course-progress-summary';
import { useMyLevel } from '#/data-hooks/use-my-level';
import { courseDetailsAtomFamily } from '#/hooks/data/use-course-details';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { filterCourseToLevel } from '#/lib/level-visibility';
import {
  archiveSectionOpenAtom,
  openModuleSlugAtom,
} from '../../atoms/sidebar';
import { computeArchivedLessons } from './compute-archived-lessons';
import { computeLessonLocks } from './compute-lesson-locks';
import { CourseSidebar } from './course-sidebar';

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
  // The arithmetic deliberately mirrors `aggregateCourseProgress`: module% is
  // the rounded mean of its lessons' percents, and course% the rounded mean of
  // the modules that HAVE lessons — an empty module does not vote, for the
  // same reason it does not there.
  const { lessonPercents, modulePercents, coursePercent } = useMemo(() => {
    const lessonPercents: Record<string, number> = {};
    const modulePercents: Record<number, number> = {};
    const progress = progressQuery.data;
    const details = visibleDetails;
    if (!progress || !details) {
      return { lessonPercents, modulePercents, coursePercent: 0 };
    }

    const percentByLessonId = new Map(
      progress.lessons.map((lesson) => [lesson.lessonId, lesson.percent]),
    );

    const countedModulePercents: number[] = [];
    for (const mod of details.modules) {
      let sum = 0;
      for (const lesson of mod.lessons) {
        // A lesson with no progress row has done nothing, which is 0 — not
        // "unknown". Skipping it would divide by a smaller denominator and
        // read as further along than the pilot is.
        const percent = percentByLessonId.get(lesson.id) ?? 0;
        lessonPercents[lesson.slug] = percent;
        sum += percent;
      }
      const percent =
        mod.lessons.length === 0 ? 0 : Math.round(sum / mod.lessons.length);
      modulePercents[mod.id] = percent;
      if (mod.lessons.length > 0) countedModulePercents.push(percent);
    }

    const coursePercent =
      countedModulePercents.length === 0
        ? 0
        : Math.round(
            countedModulePercents.reduce((total, p) => total + p, 0) /
              countedModulePercents.length,
          );

    return { lessonPercents, modulePercents, coursePercent };
  }, [progressQuery.data, visibleDetails]);

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
    return {
      status: 'ready' as const,
      title: data.name,
      moduleCount,
      lessonCount,
      modules,
    };
  }, [
    visibleDetails,
    detailsQuery.isError,
    detailsQuery.isLoading,
    levelPending,
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
      level={
        viewingAsAuthor || !levelQuery.data
          ? null
          : LEVEL_LABELS[levelQuery.data.level]
      }
      archivedLessons={archivedLessons}
      archiveSectionOpen={archiveSectionOpen}
      onArchiveSectionOpenChange={setArchiveSectionOpen}
    />
  );
};
