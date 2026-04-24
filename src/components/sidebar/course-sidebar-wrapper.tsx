import { useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useMemo } from 'react';
import { openModuleSlugAtom } from '../../atoms/sidebar';
import { useCourseDetails } from '../../hooks/data/use-course-details';
import { CourseSidebar } from './course-sidebar';

const COURSE_SLUG = '3d-airmanship';

export const CourseSidebarWrapper = () => {
  const { data, isLoading, isError } = useCourseDetails(COURSE_SLUG);
  const params = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);

  const derived = useMemo(() => {
    if (isLoading) return { status: 'loading' as const };
    if (isError || data == null) return { status: 'error' as const };
    const moduleCount = data.modules.length;
    const lessonCount = data.modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0,
    );
    return {
      status: 'ready' as const,
      title: data.name,
      moduleCount,
      lessonCount,
      modules: data.modules,
    };
  }, [data, isError, isLoading]);

  if (derived.status === 'loading' || derived.status === 'error') {
    return (
      <CourseSidebar
        status={derived.status}
        openModuleSlug={openModuleSlug}
        onOpenChange={setOpenModuleSlug}
        activeLessonSlug={null}
      />
    );
  }

  return (
    <CourseSidebar
      status="ready"
      title={derived.title}
      moduleCount={derived.moduleCount}
      lessonCount={derived.lessonCount}
      modules={derived.modules}
      openModuleSlug={openModuleSlug}
      onOpenChange={setOpenModuleSlug}
      activeLessonSlug={params.lessonSlug ?? null}
    />
  );
};
