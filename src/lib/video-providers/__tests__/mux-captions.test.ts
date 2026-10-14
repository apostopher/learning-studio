import { describe, expect, it } from 'vitest';
import { labelForLang } from '#/lib/video-languages';
import {
  captionsVttUrl,
  captionTrackName,
  describeMuxError,
  findAudioTrackId,
  muxCaptionLanguage,
  pickCaptionTrack,
  playbackCacheTtl,
  shouldRefreshCaptions,
  trackOutcome,
  type VideoCaptionsRow,
} from '#/lib/video-providers/mux-captions';

describe('muxCaptionLanguage', () => {
  it.each([
    ['en', 'en'],
    ['fr', 'fr'],
    ['fr-CA', 'fr'],
    ['es', 'es'],
    ['de', 'de'],
    ['pt-BR', 'pt'],
    ['tr', 'tr'],
  ] as const)('%s → %s', (lang, code) => {
    expect(muxCaptionLanguage(lang)).toBe(code);
  });
  it.each([
    'ja',
    'zh',
    'af',
    'ar',
    'hi',
  ] as const)('%s is unsupported', (lang) => {
    expect(muxCaptionLanguage(lang)).toBeNull();
  });
});

describe('pickCaptionTrack', () => {
  const text = (o: object) => ({ type: 'text', ...o });
  it('prefers a ready track in the language, generated or uploaded', () => {
    expect(
      pickCaptionTrack(
        [
          text({
            id: 'p',
            status: 'preparing',
            language_code: 'en',
            text_source: 'generated_vod',
          }),
          text({
            id: 'u',
            status: 'ready',
            language_code: 'en',
            text_source: 'uploaded',
          }),
        ],
        'en',
      ),
    ).toEqual({ trackId: 'u', status: 'ready' });
  });
  it('falls back to a preparing track as generating', () => {
    expect(
      pickCaptionTrack(
        [text({ id: 'p', status: 'preparing', language_code: 'fr' })],
        'fr',
      ),
    ).toEqual({ trackId: 'p', status: 'generating' });
  });
  it('ignores other languages, errored/deleted tracks and non-text tracks', () => {
    expect(
      pickCaptionTrack(
        [
          text({ id: 'a', status: 'ready', language_code: 'es' }),
          text({ id: 'b', status: 'errored', language_code: 'en' }),
          text({ id: 'c', status: 'deleted', language_code: 'en' }),
          { id: 'd', type: 'audio', status: 'ready', language_code: 'en' },
        ],
        'en',
      ),
    ).toBeNull();
  });
  it('matches a regional code on its base language (en-US counts as en)', () => {
    expect(
      pickCaptionTrack(
        [text({ id: 'r', status: 'ready', language_code: 'en-US' })],
        'en',
      ),
    ).toEqual({ trackId: 'r', status: 'ready' });
  });
});

describe('findAudioTrackId', () => {
  it('returns the first ready audio track, else the first audio track', () => {
    expect(
      findAudioTrackId([
        { id: 'v', type: 'video' },
        { id: 'a', type: 'audio', status: 'ready' },
      ]),
    ).toBe('a');
    expect(findAudioTrackId([{ id: 'v', type: 'video' }])).toBeNull();
  });
});

describe('trackOutcome', () => {
  it('maps the stored track to its current state; a vanished track has failed', () => {
    expect(
      trackOutcome([{ id: 't', type: 'text', status: 'ready' }], 't'),
    ).toBe('ready');
    expect(
      trackOutcome([{ id: 't', type: 'text', status: 'preparing' }], 't'),
    ).toBe('generating');
    expect(
      trackOutcome([{ id: 't', type: 'text', status: 'errored' }], 't'),
    ).toBe('failed');
    expect(trackOutcome([], 't')).toBe('failed');
  });
});

describe('shouldRefreshCaptions', () => {
  const row = (o: Partial<VideoCaptionsRow>): VideoCaptionsRow => ({
    playbackId: 'p',
    assetId: 'a',
    trackId: 't',
    languageCode: 'en',
    status: 'generating',
    error: null,
    checkedAt: new Date(0),
    ...o,
  });
  const now = new Date(60_000);
  it('refreshes a generating row last checked a minute ago when a token exists', () => {
    expect(shouldRefreshCaptions(row({}), now, true)).toBe(true);
  });
  it('never refreshes inside the interval, without a token, or when not generating', () => {
    expect(
      shouldRefreshCaptions(row({ checkedAt: new Date(1) }), now, true),
    ).toBe(false);
    expect(shouldRefreshCaptions(row({}), now, false)).toBe(false);
    expect(shouldRefreshCaptions(row({ status: 'ready' }), now, true)).toBe(
      false,
    );
    expect(shouldRefreshCaptions(row({ assetId: null }), now, true)).toBe(
      false,
    );
  });
});

describe('captionsVttUrl', () => {
  it('is the signed text-track URL, token reused from playback', () => {
    expect(captionsVttUrl('pid', 'tid', 'jwt')).toBe(
      'https://stream.mux.com/pid/text/tid.vtt?token=jwt',
    );
  });
});

describe('playbackCacheTtl', () => {
  it('keeps the 30s safety margin under the URL expiry', () => {
    expect(playbackCacheTtl(3600, false)).toBe(3570);
    expect(playbackCacheTtl(10, false)).toBe(1);
  });
  it('caps at 60s while captions are generating, so CC appears soon after', () => {
    expect(playbackCacheTtl(3600, true)).toBe(60);
    expect(playbackCacheTtl(40, true)).toBe(10);
  });
});

describe('describeMuxError', () => {
  it('names a rejected token', () => {
    expect(describeMuxError({ status: 401, message: 'x' })).toBe(
      'Mux rejected the API token.',
    );
    expect(describeMuxError({ status: 403, message: 'x' })).toBe(
      'Mux rejected the API token.',
    );
  });
  it('explains the 7-day contract limit', () => {
    expect(
      describeMuxError({
        status: 400,
        message: 'Assets older than 7 days cannot have subtitles generated',
      }),
    ).toBe(
      'Mux only captions videos older than 7 days on request — contact Mux support.',
    );
  });
  it('passes anything else through in words', () => {
    expect(describeMuxError(new Error('boom'))).toBe(
      "Mux couldn't generate captions: boom",
    );
  });
  // The SDK's APIError message is "<status> <raw JSON body>"; Mux's own
  // words live in the parsed body's `error.messages`.
  const apiError = (status: number, messages: string[]) => ({
    status,
    message: `${status} ${JSON.stringify({ error: { type: 'invalid_parameters', messages } })}`,
    error: { error: { type: 'invalid_parameters', messages } },
  });
  it("uses Mux's own messages, not the raw status and JSON", () => {
    expect(
      describeMuxError(
        apiError(400, ['Audio track not found.', 'Try another track.']),
      ),
    ).toBe(
      "Mux couldn't generate captions: Audio track not found. Try another track.",
    );
  });
  it('spots the 7-day limit inside the structured messages too', () => {
    expect(
      describeMuxError(
        apiError(400, [
          'Assets older than 7 days cannot have subtitles generated',
        ]),
      ),
    ).toBe(
      'Mux only captions videos older than 7 days on request — contact Mux support.',
    );
  });
  it('still names a rejected token when the body is structured', () => {
    expect(describeMuxError(apiError(401, ['Unauthorized']))).toBe(
      'Mux rejected the API token.',
    );
  });
});

describe('captionTrackName', () => {
  it('labels the generated track with the language name', () => {
    expect(captionTrackName('fr')).toBe(`${labelForLang('fr')} (generated)`);
  });
});
