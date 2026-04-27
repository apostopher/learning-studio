import { useParams } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { openModuleSlugAtom } from "../../atoms/sidebar";
import {
  lessonPercentsAtomFamily,
  modulePercentsAtomFamily,
} from "../../atoms/course-progress";
import { courseDetailsAtomFamily } from "#/hooks/data/use-course-details";
import { CourseSidebar } from "./course-sidebar";

const COURSE_SLUG = "3d-airmanship";

type LessonLike = { slug: string; name: string; videoId: string | null };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

export const CourseSidebarWrapper = () => {
  const detailsQuery = useAtomValue(courseDetailsAtomFamily(COURSE_SLUG));
  const lessonPercents = useAtomValue(lessonPercentsAtomFamily(COURSE_SLUG));
  const modulePercents = useAtomValue(modulePercentsAtomFamily(COURSE_SLUG));

  const params = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };
  const [openModuleSlug, setOpenModuleSlug] = useAtom(openModuleSlugAtom);

  const derived = useMemo(() => {
    if (detailsQuery.isLoading) return { status: "loading" as const };
    if (detailsQuery.isError || detailsQuery.data == null)
      return { status: "error" as const };
    const data = detailsQuery.data;
    const modules = data.modules as unknown as readonly ModuleLike[];
    const moduleCount = modules.length;
    const lessonCount = modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0,
    );
    return {
      status: "ready" as const,
      title: data.name,
      moduleCount,
      lessonCount,
      modules,
    };
  }, [detailsQuery.data, detailsQuery.isError, detailsQuery.isLoading]);

  if (derived.status === "loading" || derived.status === "error") {
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
      lessonPercents={lessonPercents}
      modulePercents={modulePercents}
    />
  );
};
