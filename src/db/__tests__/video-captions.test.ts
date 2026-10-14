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
} = vi.hoisted(() => ({
  lessonRows: { value: [] as unknown[] },
  getCourseIdsForLesson: vi.fn(),
  resolveCourseProvider: vi.fn(),
  muxApiFromCreds: vi.fn(),
  requestMuxCaptions: vi.fn(),
  readMuxCaptions: vi.fn(),
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
vi.mock('#/lib/video-providers/mux-captions-service', () => ({
  requestMuxCaptions,
  readMuxCaptions,
}));

import {
  findCaptionsApi,
  getLessonCaptionsStatus,
  muxCaptionsForPlayback,
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
    readMuxCaptions.mockResolvedValueOnce({ status: 'ready', trackId: 'trk' });
    expect(await muxCaptionsForPlayback('p', {})).toEqual({
      status: 'ready',
      trackId: 'trk',
    });
    readMuxCaptions.mockResolvedValueOnce({
      status: 'generating',
      trackId: null,
    });
    expect(await muxCaptionsForPlayback('p', {})).toEqual({
      status: 'pending',
    });
    readMuxCaptions.mockResolvedValueOnce({ status: 'failed', trackId: null });
    expect(await muxCaptionsForPlayback('p', {})).toBeNull();
    readMuxCaptions.mockResolvedValueOnce(null);
    expect(await muxCaptionsForPlayback('p', {})).toBeNull();
  });

  it('hands the read the serving course credentials API (for the refresh)', async () => {
    muxApiFromCreds.mockReturnValue(API);
    readMuxCaptions.mockResolvedValueOnce(null);
    await muxCaptionsForPlayback('p', { creds: 1 });
    expect(muxApiFromCreds).toHaveBeenCalledWith({ creds: 1 });
    expect(readMuxCaptions.mock.calls.at(-1)?.[0]).toMatchObject({ api: API });
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
