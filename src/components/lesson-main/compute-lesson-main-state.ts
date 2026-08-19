import {
  isMaterialReadOnly,
  type LessonMaterialResponse,
} from '#/lib/lesson-gating';
import { playbackToState } from '#/lib/video-providers/playback-to-state';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';
import { findLesson } from './find-lesson';
import type { LessonMainState, VideoFetchState } from './types';

type CourseLike = {
  modules: readonly {
    slug: string;
    lessons: readonly {
      slug: string;
      name: string;
      hasVideo: boolean;
      hasDebrief: boolean;
      needsVideoWatch: boolean;
    }[];
  }[];
};

type CourseQueryShape = {
  data: CourseLike | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
};

type VideoQueryShape = {
  data: PlaybackResult | undefined;
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

const resolveVideoState = (
  video: VideoQueryShape,
  onRetryVideo: () => void,
): VideoFetchState => {
  if (video.isError) {
    return {
      status: 'error',
      message: errorMessage(video.error),
      onRetry: onRetryVideo,
    };
  }
  return playbackToState(video.data, onRetryVideo);
};

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
  // The course payload — not the material endpoint — is what answers "does
  // this lesson exist": the material response no longer distinguishes an
  // absent lesson from a lesson with nothing authored.
  if (!lesson) return { kind: 'not-found', lessonSlug };

  // A failed material query no longer blocks the page. It used to produce a
  // 'material-error' state that suppressed the player as well, on the grounds
  // that an unknown lock state must not render as unlocked — but the video's
  // own endpoint (/api/lesson/playback) re-evaluates the identical gate
  // server-side and 403s a locked lesson, so the page-level suppression bought
  // nothing and cost the learner the whole lesson whenever the material query
  // hiccupped. `material.data` is undefined on failure, which falls through to
  // "no page-level lock"; the material panel reports and retries its own
  // failure below the player.
  //
  // The material response is still the single signal for a page-level lock. A
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

  // A completed out-of-tier lesson: served, but nothing done here is
  // recorded. Checked before the `!lesson.hasVideo` branch below because a
  // read-only lesson can have either shape (video or not) — 'read-only' is a
  // different axis from 'no-video', not a special case of it.
  if (isMaterialReadOnly(materialData)) {
    return {
      kind: 'read-only',
      lessonName: lesson.name,
      lessonSlug: lesson.slug,
      courseSlug,
      hasDebrief: lesson.hasDebrief,
      videoExpected: lesson.needsVideoWatch,
      videoState: lesson.hasVideo
        ? resolveVideoState(video, onRetryVideo)
        : null,
    };
  }

  if (!lesson.hasVideo) {
    // Carries the slugs so the caller can render the material panel beneath
    // the card. Without them this branch showed a bare "no video" notice and
    // nothing else — the lesson's own content was unreachable.
    return {
      kind: 'no-video',
      lessonName: lesson.name,
      lessonSlug,
      courseSlug,
      hasDebrief: lesson.hasDebrief,
      videoExpected: lesson.needsVideoWatch,
    };
  }
  return {
    kind: 'ready',
    lessonName: lesson.name,
    lessonSlug: lesson.slug,
    courseSlug,
    videoState: resolveVideoState(video, onRetryVideo),
    hasDebrief: lesson.hasDebrief,
  };
};
