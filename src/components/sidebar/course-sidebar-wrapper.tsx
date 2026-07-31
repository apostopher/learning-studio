import { useParams } from '@tanstack/react-router';
import { useAtom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useCourseProgressSummary } from '#/data-hooks/use-course-progress-summary';
import { courseDetailsAtomFamily } from '#/hooks/data/use-course-details';
import { useIsAdmin } from '#/hooks/use-is-admin';
import { openModuleSlugAtom } from '../../atoms/sidebar';
import { computeLessonLocks } from './compute-lesson-locks';
import { CourseSidebar } from './course-sidebar';

type LessonLike = { slug: string; name: string; videoId: string | null };
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
  const isAdmin = useIsAdmin();
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);

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
    const details = detailsQuery.data;
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
  }, [progressQuery.data, detailsQuery.data]);

  // Computed client-side from the two queries above — never written back to
  // getCourseDetailsWithCache, whose Redis entry is shared across every
  // student. Resolves to {} until both queries have data, so a half-loaded
  // sidebar never shows a lock nobody can yet explain, and to {} for an admin,
  // whose rows all open regardless of what the predicate says.
  const lessonLocks = useMemo(
    () =>
      computeLessonLocks(
        detailsQuery.data ?? undefined,
        progressQuery.data,
        isAdmin,
      ),
    [detailsQuery.data, progressQuery.data, isAdmin],
  );

  const derived = useMemo(() => {
    if (detailsQuery.isLoading) return { status: 'loading' as const };
    if (detailsQuery.isError || detailsQuery.data == null)
      return { status: 'error' as const };
    const data = detailsQuery.data;
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
  }, [detailsQuery.data, detailsQuery.isError, detailsQuery.isLoading]);

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
    />
  );
};
