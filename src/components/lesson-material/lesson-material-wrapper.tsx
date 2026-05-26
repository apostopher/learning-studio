import { useRef } from "react";
import { useLessonMaterial } from "#/hooks/data/use-lesson-material";
import { LessonMaterialView } from "./lesson-material";
import { LessonMaterialSkeleton } from "./lesson-material-skeleton";

type LessonMaterialWrapperProps = {
  lessonSlug: string;
};

export const lessonMaterialRef = { current: null as HTMLDivElement | null };

export const LessonMaterialWrapper = ({
  lessonSlug,
}: LessonMaterialWrapperProps) => {
  const { data, isLoading, isError } = useLessonMaterial(lessonSlug);
  const tabsRef = useRef<HTMLDivElement>(null);

  lessonMaterialRef.current = tabsRef.current;

  if (isLoading) return <LessonMaterialSkeleton />;
  if (isError || !data) return null;

  return <LessonMaterialView material={data} tabsRef={tabsRef} />;
};
