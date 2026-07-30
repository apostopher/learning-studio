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
      material: { data: { locked: true, reason: 'video' }, isLoading: false },
      onRetryCourse,
      onRetryVideo,
    });

    // The video gate locks material only — the video is how it is satisfied.
    expect(state.kind).toBe('ready');
  });
});
