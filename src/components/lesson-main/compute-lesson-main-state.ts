import type { LessonMaterialResponse } from '#/lib/lesson-gating';
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

type MaterialQueryShape = {
  data: LessonMaterialResponse<unknown> | undefined;
  isLoading: boolean;
};

export type ComputeArgs = {
  course: CourseQueryShape;
  courseSlug: string;
  moduleSlug: string;
  lessonSlug: string;
  video: VideoQueryShape;
  /**
   * Optional so every pre-existing call site (and test) that predates the
   * lesson-lock gate keeps compiling unchanged. Omitting it is equivalent to
   * "material query has not resolved yet" — never locks the page.
   */
  material?: MaterialQueryShape;
  onRetryCourse: () => void;
  onRetryVideo: () => void;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong';

export const computeLessonMainState = ({
  course,
  courseSlug,
  moduleSlug,
  lessonSlug,
  video,
  material,
  onRetryCourse,
  onRetryVideo,
}: ComputeArgs): LessonMainState => {
  // Hold at the loading state until BOTH course and material have resolved.
  // Reusing 'course-loading' rather than adding a state, since the skeleton
  // it renders is generic. This deliberately delays the player until the
  // slower of two parallel queries settles — an unlocked lesson can show the
  // skeleton marginally longer than before. That is the accepted tradeoff:
  // a `lesson`/`module` reason must prevent the player from rendering at
  // all, not merely hide it after a transient render, and both queries start
  // on mount and are usually cache-warm (courseDetails: 48h staleTime;
  // material: 1h once unlocked), so the added wait is small. Do not "fix"
  // this by dropping the material.isLoading check — that reintroduces the
  // loading-race flash this exists to prevent.
  if (course.isLoading || material?.isLoading) {
    return { kind: 'course-loading' };
  }
  if (course.isError) {
    return {
      kind: 'course-error',
      message: errorMessage(course.error),
      onRetry: onRetryCourse,
    };
  }
  const lesson = findLesson(course.data, moduleSlug, lessonSlug);
  if (!lesson) return { kind: 'not-found', lessonSlug };

  // The material response is the single signal for a page-level lock. A
  // `lesson`/`module` reason means the whole lesson — video included — is
  // unreachable, so the player must never be rendered for it. A `video`
  // reason is deliberately excluded: it locks material only, because
  // watching the video is how that gate gets satisfied.
  const materialData = material?.data;
  if (
    materialData?.locked &&
    (materialData.reason === 'lesson' || materialData.reason === 'module')
  ) {
    return {
      kind: 'locked',
      lessonName: lesson.name,
      courseSlug,
      lock: materialData,
    };
  }

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
    courseSlug,
    videoId: lesson.videoId,
    videoState,
  };
};
