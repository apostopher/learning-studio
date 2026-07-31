import { useQueryClient } from '@tanstack/react-query';
import { refetchLessonPlaybackFresh } from '#/atoms/lesson-video';
import { useRecordLastViewedLesson } from '#/data-hooks/use-record-last-viewed';
import { queryKeys } from '#/hooks/data/keys';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { useLessonVideo } from '#/hooks/data/use-lesson-video';
import { computeLessonMainState } from './compute-lesson-main-state';
import { LessonMain } from './lesson-main';
import { shouldRecordLastViewed } from './should-record-last-viewed';

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
  const video = useLessonVideo(lessonSlug);
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
      if (!lessonSlug) return;
      // Not `invalidateQueries`: that re-runs the default queryFn, which
      // hits the SAME server route without `fresh=1` — and that route can
      // serve a Redis-cached body. Every caller of `onRetryVideo` (a plain
      // retry click on a failed video, or the mid-playback recovery path
      // wired through `VideoFetchState.ready.onRetry`) already has evidence
      // the cached value might be bad, not merely stale.
      //
      // `.catch()` here is deliberate, not an oversight: `useLessonVideo`'s
      // query observer already surfaces a failed refetch as `video.isError`,
      // which `computeLessonMainState` turns into the user-facing error
      // state — that is the ONE path the failure needs to reach. Without
      // this, a failed recovery attempt (exactly the moment a student's
      // video just broke) would additionally log an unhandled promise
      // rejection on every failure, which is noise, not signal, on a path
      // that already has a real error handler.
      void refetchLessonPlaybackFresh(queryClient, lessonSlug).catch(() => {});
    },
  });

  // Move the resume pointer only once this lesson has actually rendered its
  // content unlocked — never for a lock screen, an error, or a still-loading
  // page. Derived from the computed state rather than from the params, so the
  // pointer can never claim a lesson the learner was not shown.
  useRecordLastViewedLesson({
    lessonSlug,
    enabled: shouldRecordLastViewed(state),
  });

  return <LessonMain state={state} />;
};
