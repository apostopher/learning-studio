import { useCourseDetails } from '#/hooks/data/use-course-details';
import { computeLessonHeaderState } from './compute-lesson-header-state';
import { LessonHeader } from './lesson-header';

const COURSE_SLUG = '3d-airmanship';

type LessonHeaderWrapperProps = {
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonHeaderWrapper = ({
  moduleSlug,
  lessonSlug,
}: LessonHeaderWrapperProps) => {
  const course = useCourseDetails(COURSE_SLUG);
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
