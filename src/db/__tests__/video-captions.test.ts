// @vitest-environment node
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  lessonRows,
  getCourseIdsForLesson,
  resolveCourseProvider,
  muxApiFromCreds,
  requestMuxCaptions,
  readMuxCaptions,
  invalidatePlayback,
} = vi.hoisted(() => ({
  lessonRows: { value: [] as unknown[] },
  getCourseIdsForLesson: vi.fn(),
  resolveCourseProvider: vi.fn(),
  muxApiFromCreds: vi.fn(),
  requestMuxCaptions: vi.fn(),
  readMuxCaptions: vi.fn(),
  invalidatePlayback: vi.fn(),
}));

vi.mock('#/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => lessonRows.value }),
    }),
  },
}));

// Fully stubbed schema (never importOriginal): real pgTable objects so `eq`
// can build against real columns.
vi.mock('#/db/schema', () => ({
  lessonsTable: pgTable('lessons', {
    id: integer('id').primaryKey(),
    slug: text('slug'),
    videoProvider: text('video_provider'),
    videoRef: text('video_ref'),
    otherVideoIds: jsonb('other_video_ids'),
  }),
  videoCaptionsTable: pgTable('video_captions', {
    playbackId: text('playback_id').primaryKey(),
    assetId: text('asset_id'),
    trackId: text('track_id'),
    languageCode: text('language_code'),
    status: text('status'),
    error: text('error'),
    checkedAt: timestamp('checked_at'),
    updatedAt: timestamp('updated_at'),
  }),
}));
vi.mock('#/db/admin', () => ({ resolveCourseProvider }));
vi.mock('#/db/placements', () => ({ getCourseIdsForLesson }));
vi.mock('#/lib/video-providers/mux-api.server', () => ({ muxApiFromCreds }));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: { invalidate: invalidatePlayback },
}));
vi.mock('#/lib/video-providers/mux-captions-service', () => ({
  requestMuxCaptions,
  readMuxCaptions,
}));

import {
  findCaptionsApi,
  getLessonCaptionsStatus,
  muxCaptionsForPlayback,
  requestLessonCaptions,
  requestLessonCaptionsSafely,
} from '#/db/video-captions';

const API = {
  assetIdForPlayback: vi.fn(),
  assetTracks: vi.fn(),
  generateSubtitles: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  lessonRows.value = [];
});

describe('findCaptionsApi', () => {
  it('uses the first course placing the lesson whose Mux credentials have a token', async () => {
    getCourseIdsForLesson.mockResolvedValue([3, 7]);
    resolveCourseProvider.mockImplementation(async (courseId: number) =>
      courseId === 7
        ? { keyId: 'k', privateKey: 'p', apiTokenId: 't', apiTokenSecret: 's' }
        : { keyId: 'k', privateKey: 'p' },
    );
    muxApiFromCreds.mockImplementation((c: { apiTokenId?: string }) =>
      c?.apiTokenId ? API : null,
    );
    expect(await findCaptionsApi(10)).toBe(API);
    expect(resolveCourseProvider).toHaveBeenCalledWith(7, 'mux');
  });

  // A course whose stored credentials can't be decrypted (rotated key, bad
  // envelope) must not take captions down for every other course.
  it('skips a course whose credentials fail to load, and uses the next', async () => {
    getCourseIdsForLesson.mockResolvedValue([3, 7]);
    resolveCourseProvider.mockImplementation(async (courseId: number) => {
      if (courseId === 3) throw new Error('bad envelope');
      return { apiTokenId: 't', apiTokenSecret: 's' };
    });
    muxApiFromCreds.mockImplementation((c: { apiTokenId?: string }) =>
      c?.apiTokenId ? API : null,
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await findCaptionsApi(10)).toBe(API);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('null when no course has a token, or the lesson is in no course', async () => {
    getCourseIdsForLesson.mockResolvedValue([]);
    expect(await findCaptionsApi(10)).toBeNull();
  });
});

describe('requestLessonCaptionsSafely', () => {
  it('never throws — a captions failure must not fail the video save', async () => {
    getCourseIdsForLesson.mockRejectedValue(new Error('db down'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      requestLessonCaptionsSafely({
        lessonId: 10,
        playbackId: 'p',
        lang: 'en',
      }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe('muxCaptionsForPlayback', () => {
  it('maps a ready row to its track, generating to pending, anything else to null', async () => {
    muxApiFromCreds.mockReturnValue(null);
    getCourseIdsForLesson.mockResolvedValue([]);
    readMuxCaptions.mockResolvedValueOnce({ status: 'ready', trackId: 'trk' });
    expect(await muxCaptionsForPlayback('p', {}, 10)).toEqual({
      status: 'ready',
      trackId: 'trk',
    });
    readMuxCaptions.mockResolvedValueOnce({
      status: 'generating',
      trackId: null,
    });
    expect(await muxCaptionsForPlayback('p', {}, 10)).toEqual({
      status: 'pending',
    });
    readMuxCaptions.mockResolvedValueOnce({ status: 'failed', trackId: null });
    expect(await muxCaptionsForPlayback('p', {}, 10)).toBeNull();
    readMuxCaptions.mockResolvedValueOnce(null);
    expect(await muxCaptionsForPlayback('p', {}, 10)).toBeNull();
  });

  it('refreshes through the serving course token when it has one, without looking further', async () => {
    muxApiFromCreds.mockReturnValue(API);
    readMuxCaptions.mockResolvedValueOnce(null);
    await muxCaptionsForPlayback('p', { creds: 1 }, 10);
    expect(muxApiFromCreds).toHaveBeenCalledWith({ creds: 1 });
    expect(readMuxCaptions.mock.calls.at(-1)?.[0]).toMatchObject({ api: API });
    expect(getCourseIdsForLesson).not.toHaveBeenCalled();
    expect(resolveCourseProvider).not.toHaveBeenCalled();
  });

  // A learner in a course whose Mux credentials carry no API token must
  // still see captions finish: the refresh falls back to the same rule
  // generation uses — the first token-bearing course placing the lesson.
  it('without a serving token, refreshes through another course placing the lesson', async () => {
    const OTHER = { ...API };
    const serving = { keyId: 'k', privateKey: 'p' };
    const other = { apiTokenId: 't', apiTokenSecret: 's' };
    getCourseIdsForLesson.mockResolvedValue([7]);
    resolveCourseProvider.mockResolvedValue(other);
    muxApiFromCreds.mockImplementation((c: unknown) =>
      c === other ? OTHER : null,
    );
    readMuxCaptions.mockResolvedValueOnce(null);

    await muxCaptionsForPlayback('p', serving, 10);

    expect(getCourseIdsForLesson).toHaveBeenCalledWith(10);
    expect(resolveCourseProvider).toHaveBeenCalledWith(7, 'mux');
    expect(readMuxCaptions.mock.calls.at(-1)?.[0].api).toBe(OTHER);
  });
});

describe('requestLessonCaptions', () => {
  // Learners' playback cache would otherwise hold `captions: null` for up
  // to its full TTL after captions start (or are already ready).
  it.each([
    'generating',
    'ready',
  ] as const)('evicts the lesson playback cache when the outcome is %s', async (outcome) => {
    getCourseIdsForLesson.mockResolvedValue([]);
    requestMuxCaptions.mockResolvedValueOnce(outcome);
    lessonRows.value = [{ slug: 'intro' }];
    expect(
      await requestLessonCaptions({
        lessonId: 10,
        playbackId: 'p',
        lang: 'en',
      }),
    ).toBe(outcome);
    expect(invalidatePlayback).toHaveBeenCalledWith('intro');
  });

  it.each([
    'failed',
    'unsupported',
    'no_token',
  ] as const)('leaves the cache alone when the outcome is %s', async (outcome) => {
    getCourseIdsForLesson.mockResolvedValue([]);
    requestMuxCaptions.mockResolvedValueOnce(outcome);
    lessonRows.value = [{ slug: 'intro' }];
    await requestLessonCaptions({ lessonId: 10, playbackId: 'p', lang: 'en' });
    expect(invalidatePlayback).not.toHaveBeenCalled();
  });

  it('logs, never throws, when the eviction fails', async () => {
    getCourseIdsForLesson.mockResolvedValue([]);
    requestMuxCaptions.mockResolvedValueOnce('generating');
    lessonRows.value = [{ slug: 'intro' }];
    invalidatePlayback.mockRejectedValueOnce(new Error('redis down'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await requestLessonCaptions({
        lessonId: 10,
        playbackId: 'p',
        lang: 'en',
      }),
    ).toBe('generating');
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe('getLessonCaptionsStatus', () => {
  it('is `not_mux` when the selected video is not on Mux', async () => {
    lessonRows.value = [
      { provider: 'synthesia', ref: 's1', otherVideoIds: [] },
    ];
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({
      status: 'not_mux',
      lang: 'en',
    });
  });

  it('is `no_token` when there is no row and no course has a token', async () => {
    lessonRows.value = [{ provider: 'mux', ref: 'm1', otherVideoIds: [] }];
    readMuxCaptions.mockResolvedValueOnce(null);
    getCourseIdsForLesson.mockResolvedValue([]);
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({
      status: 'no_token',
    });
  });

  it('is `none` with a token but no row, and reports the row status otherwise', async () => {
    lessonRows.value = [
      {
        provider: 'mux',
        ref: 'm1',
        otherVideoIds: [{ lang: 'fr', provider: 'mux', ref: 'm2' }],
      },
    ];
    getCourseIdsForLesson.mockResolvedValue([3]);
    resolveCourseProvider.mockResolvedValue({ apiTokenId: 't' });
    muxApiFromCreds.mockReturnValue(API);
    readMuxCaptions.mockResolvedValueOnce(null);
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({
      status: 'none',
    });
    readMuxCaptions.mockResolvedValueOnce({ status: 'failed', error: 'why' });
    expect(await getLessonCaptionsStatus(10, 'fr')).toEqual({
      status: 'failed',
      error: 'why',
      lang: 'fr',
    });
    expect(readMuxCaptions.mock.calls.at(-1)?.[1]).toBe('m2');
  });

  it('null for an unknown lesson or one with no video', async () => {
    lessonRows.value = [];
    expect(await getLessonCaptionsStatus(10, 'en')).toBeNull();
  });
});
