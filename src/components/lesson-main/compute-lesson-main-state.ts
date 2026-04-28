import type { VideoResponse } from '#/types';
import { findLesson } from './find-lesson';
import type { LessonMainState } from './types';
import { videoResponseToState } from './video-response-to-state';

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
  error?: unknown;
};

type VideoQueryShape = {
  data: VideoResponse | undefined;
  isError: boolean;
  error?: unknown;
};

export type ComputeArgs = {
  course: CourseQueryShape;
  moduleSlug: string;
  lessonSlug: string;
  video: VideoQueryShape;
  onRetryCourse: () => void;
  onRetryVideo: () => void;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong';

export const computeLessonMainState = ({
  course,
  moduleSlug,
  lessonSlug,
  video,
  onRetryCourse,
  onRetryVideo,
}: ComputeArgs): LessonMainState => {
  if (course.isLoading) return { kind: 'course-loading' };
  if (course.isError) {
    return {
      kind: 'course-error',
      message: errorMessage(course.error),
      onRetry: onRetryCourse,
    };
  }
  const lesson = findLesson(course.data, moduleSlug, lessonSlug);
  if (!lesson) return { kind: 'not-found', lessonSlug };
  if (!lesson.videoId) {
    return { kind: 'no-video', lessonName: lesson.name };
  }
  let videoState = videoResponseToState(video.data, onRetryVideo);
  if (video.isError) {
    videoState = {
      status: 'error',
      message: errorMessage(video.error),
      onRetry: onRetryVideo,
    };
  }
  return {
    kind: 'ready',
    lessonName: lesson.name,
    lessonSlug: lesson.slug,
    videoId: lesson.videoId,
    videoState,
  };
};
