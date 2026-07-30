import { useRef } from 'react';
import { lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { LessonMaterialView } from './lesson-material';
import { LessonMaterialSkeleton } from './lesson-material-skeleton';
import { MaterialLocked } from './parts/material-locked';

type LessonMaterialWrapperProps = {
  lessonSlug: string;
  courseSlug: string;
};

export const LessonMaterialWrapper = ({
  lessonSlug,
  courseSlug,
}: LessonMaterialWrapperProps) => {
  const { data, isLoading, isError } = useLessonMaterial(lessonSlug);
  const tabsRef = useRef<HTMLDivElement>(null);

  lessonMaterialRef.current = tabsRef.current;

  if (isLoading) return <LessonMaterialSkeleton />;
  if (isError || !data) return null;
  if (data.locked)
    return <MaterialLocked lock={data} courseSlug={courseSlug} />;

  return <LessonMaterialView material={data.material} tabsRef={tabsRef} />;
};
