import { findLesson } from './find-lesson';
import type { LessonHeaderState } from './lesson-header';

type CourseLike = {
  modules: readonly {
    slug: string;
    lessons: readonly { slug: string; name: string; videoId: string | null }[];
  }[];
};

type CourseQueryShape = {
  data: CourseLike | undefined;
  isLoading: boolean;
  isError: boolean;
};

export type ComputeHeaderArgs = {
  course: CourseQueryShape;
  moduleSlug: string;
  lessonSlug: string;
};

export const computeLessonHeaderState = ({
  course,
  moduleSlug,
  lessonSlug,
}: ComputeHeaderArgs): LessonHeaderState => {
  if (course.isLoading) return { kind: 'loading' };
  if (course.isError) return { kind: 'idle' };
  const lesson = findLesson(course.data, moduleSlug, lessonSlug);
  if (!lesson) return { kind: 'idle' };
  return { kind: 'title', name: lesson.name };
};
