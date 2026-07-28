import { useCourseDetails } from '#/hooks/data/use-course-details';
import { computeLessonHeaderState } from './compute-lesson-header-state';
import { LessonHeader } from './lesson-header';

type LessonHeaderWrapperProps = {
  courseSlug: string;
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonHeaderWrapper = ({
  courseSlug,
  moduleSlug,
  lessonSlug,
}: LessonHeaderWrapperProps) => {
  const course = useCourseDetails(courseSlug);
  const courseData = course.data ?? undefined;
  const state = computeLessonHeaderState({
    course: {
      data: courseData,
      isLoading: course.isLoading,
      isError: course.isError,
    },
    moduleSlug,
    lessonSlug,
  });
  return <LessonHeader state={state} />;
};
