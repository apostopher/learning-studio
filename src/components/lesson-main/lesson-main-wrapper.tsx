import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { refetchLessonPlaybackFresh } from '#/atoms/lesson-video';
import { outOfTierNoticeAtom } from '#/atoms/out-of-tier-notice';
import { useRecordLastViewedLesson } from '#/data-hooks/use-record-last-viewed';
import { queryKeys } from '#/hooks/data/keys';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { useLessonVideo } from '#/hooks/data/use-lesson-video';
import { OutOfTierMaterialError } from '#/lib/out-of-tier-material-error';
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
  const navigate = useNavigate();
  const setOutOfTierNotice = useSetAtom(outOfTierNoticeAtom);
  const course = useCourseDetails(courseSlug);
  const courseData = course.data ?? undefined;
  const video = useLessonVideo(lessonSlug);
  const material = useLessonMaterial(lessonSlug);

  // A never-completed out-of-tier lesson: /api/lesson/material 403s rather
  // than serving anything, so there is no page-level state to render here —
  // the pilot is sent back to the course with an explanation instead. Kept
  // separate from computeLessonMainState, which deliberately does not read
  // `material.isError` (a normal failed query must not take the video down
  // with it — see that file's comment); this is a different signal, checked
  // by error IDENTITY, not by isError alone.
  useEffect(() => {
    if (!material.isError) return;
    const error = material.error;
    if (!(error instanceof OutOfTierMaterialError)) return;
    setOutOfTierNotice({ level: error.level });
    navigate({
      to: '/course/$courseSlug',
      params: { courseSlug },
      replace: true,
    });
  }, [
    material.isError,
    material.error,
    courseSlug,
    navigate,
    setOutOfTierNotice,
  ]);

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
    // `isError` is deliberately not passed: a failed material query must not
    // suppress the video. `LessonMaterialWrapper` owns that failure's message
    // and retry — see computeLessonMainState.
    material: {
      data: material.data,
      isLoading: material.isLoading,
    },
    onRetryCourse: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseDetails(courseSlug),
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
