import { useQueryClient } from '@tanstack/react-query';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { useLessonVideo } from '#/hooks/data/use-lesson-video';
import { queryKeys } from '#/hooks/data/keys';
import { computeLessonMainState } from './compute-lesson-main-state';
import { findLesson } from './find-lesson';
import { LessonMain } from './lesson-main';

const COURSE_SLUG = '3d-airmanship';

type LessonMainWrapperProps = {
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonMainWrapper = ({
  moduleSlug,
  lessonSlug,
}: LessonMainWrapperProps) => {
  const queryClient = useQueryClient();
  const course = useCourseDetails(COURSE_SLUG);
  const courseData = course.data ?? undefined;
  const lesson = findLesson(courseData, moduleSlug, lessonSlug);
  const videoId = lesson?.videoId ?? '';
  const video = useLessonVideo(videoId);

  const state = computeLessonMainState({
    course: {
      data: courseData,
      isLoading: course.isLoading,
      isError: course.isError,
      error: course.error,
    },
    moduleSlug,
    lessonSlug,
    video: {
      data: video.data,
      isError: video.isError,
      error: video.error,
    },
    onRetryCourse: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseDetails(COURSE_SLUG),
      });
    },
    onRetryVideo: () => {
      if (!videoId) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessonVideo(videoId),
      });
    },
  });

  return <LessonMain state={state} />;
};
