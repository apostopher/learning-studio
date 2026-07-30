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
  /**
   * Required, not optional. This shape deliberately carried only `data` and
   * `isLoading`, which meant a failed material query fell through to
   * `kind: 'ready'` and the material area rendered nothing at all — no
   * message, no retry. It matters now that the branch has a real 500 path
   * (`lesson-gating.server.ts` throws on a missing cached payload).
   */
  isError: boolean;
  error?: unknown;
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
  /**
   * Optional for the same reason `material` is — call sites that predate the
   * gate keep compiling. A 'material-error' state can only arise from a
   * `material` that reports `isError`, and the wrapper supplies both together.
   */
  onRetryMaterial?: () => void;
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
  onRetryMaterial,
}: ComputeArgs): LessonMainState => {
  // Course errors are reported BEFORE the combined loading gate below. React
  // Query drops isLoading on error, so the course query alone would be fine
  // either way — but `material?.isLoading` would otherwise keep a course that
  // failed fast behind the skeleton until the material query settled, hiding a
  // retryable error behind a spinner.
  if (course.isError) {
    return {
      kind: 'course-error',
      message: errorMessage(course.error),
      onRetry: onRetryCourse,
    };
  }
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
  const lesson = findLesson(course.data, moduleSlug, lessonSlug);
  // Checked before material.isError: the material endpoint 404s for a lesson
  // that does not exist (or is WIP), and "this lesson doesn't exist" is a
  // better answer than "material failed, retry" for the same underlying fact.
  if (!lesson) return { kind: 'not-found', lessonSlug };

  // A failed material query means the lock state is unknown, and unknown must
  // not render as unlocked — the same rule as the loading gate above, for the
  // same reason. Retryable, never a false lock.
  if (material?.isError) {
    return {
      kind: 'material-error',
      message: errorMessage(material.error),
      onRetry: onRetryMaterial ?? onRetryCourse,
    };
  }

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
