import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '#/hooks/data/keys';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { useLessonVideo } from '#/hooks/data/use-lesson-video';
import { computeLessonMainState } from './compute-lesson-main-state';
import { findLesson } from './find-lesson';
import { LessonMain } from './lesson-main';

type LessonMainWrapperProps = {
  courseSlug: string;
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonMainWrapper = ({
  courseSlug,
  moduleSlug,
  lessonSlug,
}: LessonMainWrapperProps) => {
  const queryClient = useQueryClient();
  const course = useCourseDetails(courseSlug);
  const courseData = course.data ?? undefined;
  const lesson = findLesson(courseData, moduleSlug, lessonSlug);
  const videoId = lesson?.videoId ?? '';
  const video = useLessonVideo(videoId);
  const material = useLessonMaterial(lessonSlug);

  const state = computeLessonMainState({
    course: {
      data: courseData,
      isLoading: course.isLoading,
      isError: course.isError,
      error: course.error,
    },
    courseSlug,
    moduleSlug,
    lessonSlug,
    video: {
      data: video.data,
      isError: video.isError,
      error: video.error,
    },
    material: {
      data: material.data,
      isLoading: material.isLoading,
      isError: material.isError,
      error: material.error,
    },
    onRetryCourse: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseDetails(courseSlug),
      });
    },
    onRetryMaterial: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessonMaterial(lessonSlug),
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
