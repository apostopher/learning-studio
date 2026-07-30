import { describe, expect, it, vi } from 'vitest';
import { computeLessonMainState } from '../compute-lesson-main-state';

const onRetryCourse = vi.fn();
const onRetryVideo = vi.fn();

const baseLesson = { slug: 'l-1', name: 'Lesson One', videoId: 'v1' };
const baseCourse = {
  modules: [{ slug: 'm-1', lessons: [baseLesson] }],
};

describe('computeLessonMainState', () => {
  it('returns course-loading when course is loading', () => {
    expect(
      computeLessonMainState({
        course: { data: undefined, isLoading: true, isError: false },
        courseSlug: 'course-1',
        moduleSlug: 'm-1',
        lessonSlug: 'l-1',
        video: { data: undefined, isError: false },
        onRetryCourse,
        onRetryVideo,
      }),
    ).toEqual({ kind: 'course-loading' });
  });

  it('returns course-error when course query errored', () => {
    const result = computeLessonMainState({
      course: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('boom'),
      },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({ kind: 'course-error', message: 'boom' });
  });

  it('returns not-found when lesson is missing from course', () => {
    expect(
      computeLessonMainState({
        course: { data: baseCourse, isLoading: false, isError: false },
        courseSlug: 'course-1',
        moduleSlug: 'm-1',
        lessonSlug: 'missing',
        video: { data: undefined, isError: false },
        onRetryCourse,
        onRetryVideo,
      }),
    ).toEqual({ kind: 'not-found', lessonSlug: 'missing' });
  });

  it('returns no-video when lesson has empty videoId', () => {
    const result = computeLessonMainState({
      course: {
        data: {
          modules: [
            {
              slug: 'm-1',
              lessons: [{ slug: 'l-1', name: 'L', videoId: '' }],
            },
          ],
        },
        isLoading: false,
        isError: false,
      },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toEqual({ kind: 'no-video', lessonName: 'L' });
  });

  it('returns ready with videoState=fetching when video data is undefined', () => {
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({
      kind: 'ready',
      lessonName: 'Lesson One',
      courseSlug: 'course-1',
      videoId: 'v1',
      videoState: { status: 'fetching' },
    });
  });

  it('returns ready with videoState=ready when video data has download', () => {
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: {
        data: {
          id: 'v1',
          status: 'complete',
          download: 'https://cdn/v.mp4',
          captions: { srt: null, vtt: null },
          thumbnail: { gif: null, image: null },
        },
        isError: false,
      },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({
      kind: 'ready',
      videoState: { status: 'ready', src: 'https://cdn/v.mp4' },
    });
  });

  it('returns ready with videoState=error when video query errored', () => {
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: {
        data: undefined,
        isError: true,
        error: new Error('net'),
      },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({
      kind: 'ready',
      videoState: { status: 'error', message: 'net' },
    });
  });

  it('locks the whole page when the material reports a prerequisite gate', () => {
    const state = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: {
        data: {
          locked: true,
          reason: 'lesson',
          blockedBy: { lessonSlug: 'a', moduleSlug: 'm-1', lessonName: 'A' },
        },
        isLoading: false,
        isError: false,
      },
      onRetryCourse,
      onRetryVideo,
    });

    // A prerequisite-locked lesson must not render the player at all: if the
    // student can watch the whole video, the sequencing did not happen.
    expect(state).toMatchObject({
      kind: 'locked',
      lessonName: 'Lesson One',
      courseSlug: 'course-1',
      lock: {
        reason: 'lesson',
        blockedBy: { lessonSlug: 'a', moduleSlug: 'm-1', lessonName: 'A' },
      },
    });
  });

  it('does not lock the page for a video-only gate', () => {
    const state = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: {
        data: { locked: true, reason: 'video' },
        isLoading: false,
        isError: false,
      },
      onRetryCourse,
      onRetryVideo,
    });

    // The video gate locks material only — the video is how it is satisfied.
    expect(state.kind).toBe('ready');
  });

  it('holds at course-loading while material is still in flight, even once course has resolved', () => {
    const state = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: { data: undefined, isLoading: true, isError: false },
      onRetryCourse,
      onRetryVideo,
    });

    // If this fell through to 'ready' while the material query — the single
    // signal for a page-level lock — is still unresolved, the player would
    // render for a lesson that a moment later reports locked: exactly the
    // flash this task's constraint forbids.
    expect(state).toEqual({ kind: 'course-loading' });
  });

  it('reports a retryable error when the material query fails, instead of a blank panel', () => {
    const onRetryMaterial = vi.fn();
    const state = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('material 500'),
      },
      onRetryCourse,
      onRetryVideo,
      onRetryMaterial,
    });

    // The material response is the ONLY signal for a page-level lock, so a
    // failed material query means the lock state is unknown. Falling through
    // to 'ready' rendered the player with a silently empty material area —
    // no message, no retry — and this branch introduced a real 500 path
    // (lesson-gating.server throws on a missing cached payload). The ledger's
    // failure table promises "Error state with retry, never a false lock".
    expect(state).toMatchObject({
      kind: 'material-error',
      message: 'material 500',
    });
    if (state.kind !== 'material-error') throw new Error('unreachable');
    state.onRetry();
    expect(onRetryMaterial).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fast course error even while the material query is still loading', () => {
    const state = computeLessonMainState({
      course: {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('course boom'),
      },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: { data: undefined, isLoading: true, isError: false },
      onRetryCourse,
      onRetryVideo,
    });

    // The combined loading gate used to be checked first, so a course error
    // that resolved quickly was masked by the skeleton until the material
    // query settled — a retryable error hidden behind a spinner.
    expect(state).toMatchObject({ kind: 'course-error' });
  });

  it('prefers not-found over material-error, since a 404 on material is the same missing lesson', () => {
    const state = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'missing',
      video: { data: undefined, isError: false },
      material: { data: undefined, isLoading: false, isError: true },
      onRetryCourse,
      onRetryVideo,
    });
    expect(state).toEqual({ kind: 'not-found', lessonSlug: 'missing' });
  });
});
