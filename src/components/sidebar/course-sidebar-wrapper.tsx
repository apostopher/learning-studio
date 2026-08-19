import { useParams } from '@tanstack/react-router';
import { useAtom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useCourseProgressSummary } from '#/data-hooks/use-course-progress-summary';
import { useMyLevel } from '#/data-hooks/use-my-level';
import { courseDetailsAtomFamily } from '#/hooks/data/use-course-details';
import { useIsAdmin } from '#/hooks/use-is-admin';
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
  const isAdmin = useIsAdmin();
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);
  const [archiveSectionOpen, setArchiveSectionOpen] = useAtom(
    archiveSectionOpenAtom,
  );

  // Filter to what this pilot's level may see, before anything downstream
  // (percent maps, lock computation, module/lesson counts) reads the course
  // tree — so a hidden lesson never appears as the blocker in a lock reason
  // the pilot cannot act on, and never surfaces anywhere else in the sidebar.
  // Admins bypass the filter, matching evaluateLessonGate's admin
  // short-circuit. Until the level query resolves, this stays undefined
  // rather than falling back to the unfiltered payload — computeLessonLocks
  // and `derived` below already treat "no details yet" as "still loading", so
  // nothing unfiltered is ever handed to them, even transiently.
  const visibleDetails = useMemo(() => {
    if (!detailsQuery.data) return detailsQuery.data;
    if (isAdmin) return detailsQuery.data;
    if (!levelQuery.data) return undefined;
    return filterCourseToLevel(detailsQuery.data, levelQuery.data.level);
  }, [detailsQuery.data, levelQuery.data, isAdmin]);

  // Non-admin and course details have arrived, but the level query hasn't
  // settled (and hasn't errored) yet — visibleDetails is intentionally
  // undefined in this window; treat the sidebar as still loading rather than
  // erroring or showing anything unfiltered.
  const levelPending =
    !isAdmin && !!detailsQuery.data && !levelQuery.data && !levelQuery.isError;

  // Server-aggregated progress → the slug-keyed / moduleId-keyed maps the
  // sidebar renders. Replaces the old client-side jotai aggregation.
  //
  // CourseProgress.lessons[] carries lessonId, not a slug or a videoId — it
  // never has, and no longer even has a videoId to fall back on. This map is
  // built by joining progress rows to course details' lessonId → slug, so the
  // percent LessonList looks up under `lesson.slug` actually matches the
  // lesson it's rendering, rather than colliding on an unrelated key space.
  const { lessonPercents, modulePercents } = useMemo(() => {
    const lessonPercents: Record<string, number> = {};
    const modulePercents: Record<number, number> = {};
    const progress = progressQuery.data;
    if (progress) {
      for (const mod of progress.modules) {
        modulePercents[mod.moduleId] = mod.percent;
      }
    }
    const details = visibleDetails;
    if (progress && details) {
      const slugByLessonId = new Map<number, string>();
      for (const mod of details.modules) {
        for (const lesson of mod.lessons) {
          slugByLessonId.set(lesson.id, lesson.slug);
        }
      }
      for (const lesson of progress.lessons) {
        const slug = slugByLessonId.get(lesson.lessonId);
        if (slug) lessonPercents[slug] = lesson.percent;
      }
    }
    return { lessonPercents, modulePercents };
  }, [progressQuery.data, visibleDetails]);

  // Computed client-side from the two queries above — never written back to
  // getCourseDetailsWithCache, whose Redis entry is shared across every
  // student. Resolves to {} until both queries have data, so a half-loaded
  // sidebar never shows a lock nobody can yet explain, and to {} for an admin,
  // whose rows all open regardless of what the predicate says.
  const lessonLocks = useMemo(
    () =>
      computeLessonLocks(
        visibleDetails ?? undefined,
        progressQuery.data,
        isAdmin,
      ),
    [visibleDetails, progressQuery.data, isAdmin],
  );

  // Completed-at-an-earlier-level lessons the main (filtered) tree no longer
  // shows — the sidebar's own archive index. Deliberately built from
  // `detailsQuery.data` (the UNFILTERED tree), not `visibleDetails`: the
  // whole point is lessons that filtering just removed. Empty for an admin
  // (nothing is ever "out of tier" for them — see visibleDetails above) and
  // while the level query hasn't resolved yet, so this can never show a
  // lesson under the wrong level's rule for a moment.
  const archivedLessons = useMemo(() => {
    if (isAdmin || !levelQuery.data) return [];
    return computeArchivedLessons(
      detailsQuery.data,
      progressQuery.data,
      levelQuery.data.level,
    );
  }, [detailsQuery.data, progressQuery.data, levelQuery.data, isAdmin]);

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
      coursePercent={progressQuery.data?.percent ?? 0}
      lessonLocks={lessonLocks}
      level={
        isAdmin || !levelQuery.data ? null : LEVEL_LABELS[levelQuery.data.level]
      }
      archivedLessons={archivedLessons}
      archiveSectionOpen={archiveSectionOpen}
      onArchiveSectionOpenChange={setArchiveSectionOpen}
    />
  );
};
