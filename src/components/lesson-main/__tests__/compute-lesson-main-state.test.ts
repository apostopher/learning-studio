import { describe, expect, it, vi } from 'vitest';
import { computeLessonMainState } from '../compute-lesson-main-state';

const onRetryCourse = vi.fn();
const onRetryVideo = vi.fn();

const baseLesson = {
  slug: 'l-1',
  name: 'Lesson One',
  hasVideo: true,
  hasDebrief: false,
  needsVideoWatch: true,
};
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

  it('returns no-video when lesson has hasVideo=false', () => {
    const result = computeLessonMainState({
      course: {
        data: {
          modules: [
            {
              slug: 'm-1',
              lessons: [{ ...baseLesson, name: 'L', hasVideo: false }],
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
    // Carries the slugs now, because this branch renders the material
    // panel beneath the card — a lesson without a video used to show a
    // bare notice and nothing else.
    expect(result).toEqual({
      kind: 'no-video',
      lessonName: 'L',
      lessonSlug: 'l-1',
      courseSlug: 'course-1',
      hasDebrief: false,
      videoExpected: true,
    });
  });

  it('reports no-video from hasVideo, not from a missing videoId', () => {
    const state = computeLessonMainState({
      course: {
        data: {
          modules: [
            { slug: 'm-1', lessons: [{ ...baseLesson, hasVideo: false }] },
          ],
        },
        isLoading: false,
        isError: false,
      },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: undefined, isError: false },
      material: {
        data: { locked: false, adminBypass: false, material: {} },
        isLoading: false,
        isError: false,
      },
      onRetryCourse,
      onRetryVideo,
    });
    expect(state).toEqual({
      kind: 'no-video',
      lessonName: 'Lesson One',
      lessonSlug: 'l-1',
      courseSlug: 'course-1',
      hasDebrief: false,
      videoExpected: true,
    });
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
      videoState: { status: 'fetching' },
    });
    // `LessonMainState.ready` has no videoId — nothing outside the playback
    // layer reads the video's identity. Confirm the field is genuinely gone
    // rather than merely unasserted.
    expect(result).not.toHaveProperty('videoId');
  });

  it('returns ready with videoState=ready when video data has download', () => {
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: {
        data: {
          status: 'ready',
          url: 'https://cdn/v.mp4',
          kind: 'file',
          expiresInSeconds: 600,
          poster: null,
          captions: null,
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
    // The exact `onRetryVideo` this test passed in — not a freshly-built
    // no-op — since `VideoPlayerContainer` calls this on a mid-playback
    // 401/403 to fetch a new signed URL. A wrong or missing hop here would
    // leave that recovery path calling nothing.
    if (result.kind !== 'ready' || result.videoState.status !== 'ready') {
      throw new Error('expected ready videoState');
    }
    expect(result.videoState.onRetry).toBe(onRetryVideo);
  });

  it('forwards kind=hls and flags captions unavailable for a Mux-shaped playback (the seam LessonPlayerContainer reads to pick attachMedia and disclose no captions)', () => {
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: {
        data: {
          status: 'ready',
          url: 'https://stream.mux.com/x.m3u8',
          kind: 'hls',
          expiresInSeconds: 3600,
          poster: null,
          captions: null,
        },
        isError: false,
      },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({
      kind: 'ready',
      videoState: {
        status: 'ready',
        src: 'https://stream.mux.com/x.m3u8',
        kind: 'hls',
        captionsUnavailable: true,
      },
    });
  });

  it('returns ready with videoState=rendering when the provider is still rendering the video', () => {
    // Proves the seam actually forwards `video.data` into `playbackToState`
    // rather than merely compiling against its type — a still-rendering
    // PlaybackResult must reach videoState unchanged, not fall through to
    // 'fetching' or 'error'.
    const result = computeLessonMainState({
      course: { data: baseCourse, isLoading: false, isError: false },
      courseSlug: 'course-1',
      moduleSlug: 'm-1',
      lessonSlug: 'l-1',
      video: { data: { status: 'rendering' }, isError: false },
      onRetryCourse,
      onRetryVideo,
    });
    expect(result).toMatchObject({
      kind: 'ready',
      videoState: { status: 'rendering' },
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
